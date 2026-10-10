#!/usr/bin/env python3
"""Private fleet ledger and persistent CLI relay launcher. Python standard library only.

Records schedules; never creates them. Does not call a model until `start`.
"""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

ACTIVE = {"starting", "running"}
SCRIPT_DIR = Path(__file__).resolve().parent


def now():
    return time.time()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path = Path(path)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temp, path)


def content(path):
    value = Path(path).read_text(encoding="utf-8-sig").strip()
    if not value:
        raise ValueError(f"Empty input: {path}")
    return value


def token(value):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", value):
        raise argparse.ArgumentTypeError("Use letters, numbers, dots, underscores, or hyphens")
    return value


def positive(value):
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("Must be positive")
    return n


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


@contextlib.contextmanager
def locked(state_path):
    """No automatic lock stealing: an uncertain command must not duplicate dispatch."""
    state_path = Path(state_path).resolve()
    lock = state_path.with_suffix(".lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise ValueError(f"Ledger locked: {lock}. Check the owning process before removing a stale lock.")
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(str(os.getpid()))
        state = read_json(state_path)
        yield state
        state["updated_at"] = now()
        write_json(state_path, state)
    finally:
        lock.unlink(missing_ok=True)


def task_of(state, task_id):
    if task_id not in state["tasks"]:
        raise ValueError(f"Unknown task: {task_id}")
    return state["tasks"][task_id]


def reserve(state, request_id, payload):
    existing = state["requests"].get(request_id)
    fingerprint = digest(payload)
    if existing:
        if existing["hash"] != fingerprint:
            raise ValueError("Request ID reused with different input")
        return existing, True
    entry = {"hash": fingerprint, "created_at": now(), "payload": payload}
    state["requests"][request_id] = entry
    return entry, False


def alive(pid):
    if not pid:
        return None
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return False if ctypes.get_last_error() == 87 else None
        try:
            code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                return None
            return code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return None


def refresh(state):
    for task in state["tasks"].values():
        if task["backend"] != "local" or task["state"] not in ACTIVE:
            continue
        if not task["turns"]:
            task["blocker"] = "Launch state has no turn record; inspect the saved request before taking action."
            continue
        turn = task["turns"][-1]
        directory = Path(turn["out_dir"])
        done = directory / "runner-result.json"
        if not done.exists():
            if alive(turn.get("pid")) is False:
                task["state"] = "interrupted"
                task["blocker"] = "Runner exited without final status. Inspect artifacts; do not automatically retry."
            continue
        run = read_json(done)
        result_path = directory / "result.json"
        result = read_json(result_path) if result_path.exists() else {}
        native_id = result.get("threadId") or result.get("sessionId")
        if native_id:
            previous = task.get("native_session_id")
            if previous and previous != native_id:
                task["state"] = "failed"
                task["blocker"] = "Native session identity changed unexpectedly"
                continue
            task["native_session_id"] = native_id
        turn["runner_result"] = run
        turn["result_path"] = str(result_path)
        if run.get("exit_code") == 0 and result.get("status") == "completed":
            task["state"] = "awaiting_review"
            task["blocker"] = None
        else:
            task["state"] = "failed"
            task["blocker"] = result.get("error") or run.get("error") or f"Relay status {result.get('status')}, exit {run.get('exit_code')}"


def init_run(args):
    if args.limit > 32:
        raise ValueError("Limit must be 1–32; external provider limits still apply")
    run_id = uuid.uuid4().hex
    directory = Path(args.directory).resolve() if args.directory else Path.home() / ".delegate-fleet" / "runs" / run_id
    directory.mkdir(parents=True, exist_ok=True)
    state_path = directory / "state.json"
    if state_path.exists():
        raise ValueError("Run already exists; use its state instead of overwriting")
    state = {"schema": "delegate-fleet.v1", "run_id": run_id, "state": "active", "objective": content(args.objective),
             "acceptance_checks": content(args.checks), "authorization": content(args.authorization),
             "lead": args.lead, "max_active": args.limit, "created_at": now(), "updated_at": now(),
             "tasks": {}, "requests": {}, "monitor": {"status": "unavailable"}}
    write_json(state_path, state)
    return {"state_path": str(state_path), "run_id": run_id}


def add_task(state, args):
    if state["state"] != "active":
        raise ValueError("Run is not active")
    if args.id in state["tasks"]:
        raise ValueError("Task ID already exists; resume or inspect the existing task")
    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        raise ValueError("Workspace must already exist")
    for dependency in args.depends:
        task_of(state, dependency)
    if args.backend == "bridge" and not args.read_only:
        raise ValueError("Baseline bridge workers are read-only")
    state["tasks"][args.id] = {"id": args.id, "provider": args.provider, "model": args.model,
        "workspace": str(workspace), "scope": content(args.scope), "depends": args.depends,
        "backend": args.backend, "read_only": args.read_only, "state": "queued", "native_session_id": None,
        "managed_session_id": None, "cursor": 0, "turns": [], "reviews": [], "blocker": None}
    return state["tasks"][args.id]


def relay_command(task, out_dir, brief_path, timeout, max_turns, node):
    command = [node, str(SCRIPT_DIR / (task["provider"] + "-relay.mjs")),
        "--brief", str(brief_path), "--cd", task["workspace"], "--model", task["model"],
        "--out-dir", str(out_dir), "--timeout", timeout]
    if task["read_only"]:
        command.append("--read-only")
    elif task["provider"] == "codex":
        command += ["--sandbox", "workspace-write"]
    if task.get("native_session_id"):
        command += ["--session", task["native_session_id"]]
    if task["provider"] == "codex":
        command.append("--skip-git-repo-check")
    elif max_turns:
        command += ["--max-turns", str(max_turns)]
    return command


def start_turn(state, state_path, args):
    task = task_of(state, args.id)
    brief = content(args.brief)
    payload = {"kind": "local-turn", "task": args.id, "brief": brief,
               "timeout": args.timeout, "max_turns": args.max_turns}
    existing = state["requests"].get(args.request_id)
    if existing:
        entry, reused = reserve(state, args.request_id, payload)
        return {"reused": reused, "request_id": args.request_id, "out_dir": entry.get("out_dir")}
    if state["state"] != "active" or task["backend"] != "local":
        raise ValueError("An active local run is required")
    if task["state"] not in {"queued", "rework"}:
        raise ValueError("Task must be queued or explicitly marked for rework after review")
    if task["turns"] and not task.get("native_session_id"):
        raise ValueError("Prior turn has no exact session ID. Inspect artifacts; do not silently launch a replacement.")
    if any(task_of(state, dep)["state"] != "reviewed" for dep in task["depends"]):
        raise ValueError("Task dependencies have not been reviewed")
    if sum(t["state"] in ACTIVE for t in state["tasks"].values()) >= state["max_active"]:
        raise ValueError("No worker slot available; queue this task")
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js is required for local CLI relays")
    out_dir = Path(state_path).resolve().parent / "turns" / args.id / args.request_id
    out_dir.mkdir(parents=True, exist_ok=False)
    brief_path = out_dir / "input.txt"
    brief_path.write_text(brief, encoding="utf-8")
    command = relay_command(task, out_dir, brief_path, args.timeout, args.max_turns, node)
    command_path = out_dir / "command.json"
    write_json(command_path, command)
    entry, _ = reserve(state, args.request_id, payload)
    entry["out_dir"] = str(out_dir)
    turn = {"request_id": args.request_id, "out_dir": str(out_dir), "started_at": now(), "pid": None}
    task["turns"].append(turn)
    task["state"] = "starting"
    # Reserve before spawning. A crash between reservation and launch remains uncertain.
    write_json(state_path, state)
    try:
        kwargs = {"stdin": subprocess.DEVNULL, "close_fds": True}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        else:
            kwargs["start_new_session"] = True
        with (out_dir / "runner.log").open("wb") as log:
            proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_run", str(command_path)],
                                    stdout=log, stderr=log, **kwargs)
        turn["pid"] = proc.pid
        task["state"] = "running"
    except Exception as error:
        task["state"] = "failed"
        task["blocker"] = str(error)
        write_json(out_dir / "runner-result.json", {"exit_code": None, "error": str(error)})
    return {"reused": False, "task_id": task["id"], "state": task["state"], "out_dir": str(out_dir), "pid": turn["pid"]}


def record_bridge(state, args):
    task = task_of(state, args.id)
    if task["backend"] != "bridge":
        raise ValueError("Use refresh for local workers")
    raw = read_json(args.event)
    event = raw.get("session", raw)
    managed_id = event.get("managed_session_id")
    if not managed_id:
        raise ValueError("Record the actual managed_session_id returned by the bridge")
    if task.get("managed_session_id") and task["managed_session_id"] != managed_id:
        raise ValueError("Managed session identity changed")
    mapping = {"starting": "starting", "running": "running", "completed": "awaiting_review", "failed": "failed", "interrupted": "interrupted"}
    if event.get("state") not in mapping:
        raise ValueError("Unrecognized bridge state")
    cursor = raw.get("next_cursor", raw.get("cursor", task["cursor"]))
    if not isinstance(cursor, int) or cursor < task["cursor"]:
        raise ValueError("Cursor must be a non-decreasing integer")
    if event.get("agent") and event["agent"] != task["provider"]:
        raise ValueError("Bridge worker provider differs from assigned task")
    previous_turn = task.get("last_bridge_event", {}).get("turn_id")
    # Paging a completed turn must not erase a lead review.
    same_turn = bool(event.get("turn_id") and event["turn_id"] == previous_turn)
    if task["state"] in {"reviewed", "rework"} and (same_turn or cursor == task["cursor"]) and event["state"] == "completed":
        task["cursor"] = cursor
        return task
    task.update(managed_session_id=managed_id, cursor=cursor, state=mapping[event["state"]])
    task["last_bridge_event"] = event
    return task


def review(state, args):
    task = task_of(state, args.id)
    if task["state"] not in {"awaiting_review", "failed", "interrupted"}:
        raise ValueError("Review only a finished or interrupted worker turn")
    if args.passed and task["state"] != "awaiting_review":
        raise ValueError("A failed/interrupted turn cannot be accepted as completed")
    evidence = content(args.evidence)
    task["reviews"].append({"passed": args.passed, "evidence": evidence, "at": now()})
    task["state"] = "reviewed" if args.passed else "rework"
    return task


def summary(state):
    return {"run_id": state["run_id"], "state": state["state"], "lead": state["lead"],
        "max_active": state["max_active"], "monitor": state["monitor"],
        "tasks": [{key: task.get(key) for key in ("id", "provider", "model", "backend", "state", "depends", "native_session_id", "managed_session_id", "cursor", "blocker")}
                  for task in state["tasks"].values()]}


def runner(command_path):
    directory = Path(command_path).resolve().parent
    try:
        command = read_json(command_path)
        with (directory / "relay.stdout").open("wb") as stdout, (directory / "relay.stderr").open("wb") as stderr:
            proc = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
        result = {"exit_code": proc.returncode, "finished_at": now()}
    except Exception as error:
        result = {"exit_code": None, "error": str(error), "finished_at": now()}
    write_json(directory / "runner-result.json", result)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", help="Absolute state.json path from init")
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("init")
    for field in ("objective", "checks", "authorization", "lead"):
        p.add_argument("--" + field, required=True)
    p.add_argument("--directory")
    p.add_argument("--limit", type=positive, default=4)
    p = sub.add_parser("add")
    p.add_argument("--id", type=token, required=True)
    p.add_argument("--provider", choices=["claude", "codex"], required=True)
    for field in ("model", "workspace", "scope"):
        p.add_argument("--" + field, required=True)
    p.add_argument("--backend", choices=["local", "bridge"], default="local")
    p.add_argument("--read-only", action="store_true")
    p.add_argument("--depends", type=token, action="append", default=[])
    p = sub.add_parser("start")
    p.add_argument("--id", type=token, required=True)
    p.add_argument("--request-id", type=token, required=True)
    p.add_argument("--brief", required=True)
    p.add_argument("--timeout", default="15m")
    p.add_argument("--max-turns", type=positive)
    sub.add_parser("refresh")
    sub.add_parser("status")
    p = sub.add_parser("reserve")
    p.add_argument("--request-id", type=token, required=True)
    p.add_argument("--payload", required=True)
    p = sub.add_parser("record-bridge")
    p.add_argument("--id", type=token, required=True)
    p.add_argument("--event", required=True)
    p = sub.add_parser("review")
    p.add_argument("--id", type=token, required=True)
    p.add_argument("--evidence", required=True)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--pass", dest="passed", action="store_true")
    g.add_argument("--rework", dest="passed", action="store_false")
    p = sub.add_parser("monitor")
    p.add_argument("--record", required=True, help="JSON containing actual host scheduler ID and status")
    p = sub.add_parser("run-status")
    p.add_argument("--value", choices=["active", "paused", "blocked", "cancelled"], required=True)
    p.add_argument("--reason", required=True)
    p = sub.add_parser("finish")
    p.add_argument("--evidence", required=True)
    p = sub.add_parser("_run", help=argparse.SUPPRESS)
    p.add_argument("command_path")
    args = parser.parse_args(argv)
    if args.action == "_run":
        return runner(args.command_path)
    if args.action == "init":
        return init_run(args)
    if not args.state:
        parser.error("--state is required")
    with locked(args.state) as state:
        if state.get("schema") != "delegate-fleet.v1":
            raise ValueError("Unsupported ledger schema")
        refresh(state)
        if args.action == "add":
            result = add_task(state, args)
        elif args.action == "start":
            result = start_turn(state, args.state, args)
        elif args.action == "reserve":
            entry, reused = reserve(state, args.request_id, read_json(args.payload))
            result = {"reused": reused, "request_id": args.request_id, "hash": entry["hash"]}
        elif args.action == "record-bridge":
            result = record_bridge(state, args)
        elif args.action == "review":
            result = review(state, args)
        elif args.action == "monitor":
            monitor = read_json(args.record)
            if monitor.get("status") not in {"active", "stopped", "unavailable", "foreground"}:
                raise ValueError("Invalid monitor status")
            if monitor["status"] == "active" and not (monitor.get("id") and monitor.get("host")):
                raise ValueError("An active monitor needs the actual scheduler/goal ID and host")
            state["monitor"] = monitor
            result = monitor
        elif args.action == "run-status":
            if state["state"] == "complete":
                raise ValueError("Completed runs cannot be reopened; create a new run")
            state.update(state=args.value, status_reason=args.reason)
            result = {"state": args.value, "note": "Status change stops new dispatch only; already running processes are not terminated."}
        elif args.action == "finish":
            if state["state"] != "active" or not state["tasks"] or any(t["state"] != "reviewed" for t in state["tasks"].values()):
                raise ValueError("An active run with every required task reviewed is needed")
            if state["monitor"]["status"] == "active":
                raise ValueError("Stop this run's scheduler first, then record it stopped")
            state.update(state="complete", final_evidence=content(args.evidence), finished_at=now())
            result = summary(state)
        else:
            result = summary(state)
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(main(), ensure_ascii=False, indent=2))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(2)
