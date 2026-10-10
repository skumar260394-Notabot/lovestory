"""Exercise installed skill with fake local CLIs; never calls provider inference."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

SKILL = Path(__file__).resolve().parents[1] / 'plugins' / 'claude-codex-live-bridge' / 'skills' / 'delegate-fleet'
spec = importlib.util.spec_from_file_location("fleet", SKILL / "scripts" / "fleet.py")
fleet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fleet)

FAKE = r'''
const fs = require('node:fs');
const provider = process.argv[2];
const args = process.argv.slice(3);
if (args.includes('--version')) { console.log('fake 2.1.248'); process.exit(0); }
fs.appendFileSync(process.env.FAKE_CAPTURE, JSON.stringify({provider,args})+'\n');
let brief='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', b => brief+=b);
process.stdin.on('end', () => {
  if (process.env.FAKE_MODE==='fail') { console.error('fake model unavailable'); process.exit(5); }
  if (process.env.FAKE_MODE==='hang') { setInterval(()=>{},500); return; }
  if (!args.includes('--read-only')) fs.writeFileSync('worker-output.txt',brief);
  const sid='11111111-1111-4111-8111-111111111111';
  if(provider==='codex') {
    console.log(JSON.stringify({type:'thread.started',thread_id:sid}));
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'mock work completed'}}));
    const flag=args.includes('--output-last-message')?'--output-last-message':'-o';
    if(args.includes(flag)) fs.writeFileSync(args[args.indexOf(flag)+1],'mock work completed');
    console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
  }else{
    console.log(JSON.stringify({type:'system',subtype:'init',session_id:sid,permissionMode:'acceptEdits'}));
    console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:sid,result:'mock work completed',num_turns:1}));
  }
});
'''


class FleetChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="delegate-fleet-check-")
        self.root = Path(self.temp.name).resolve()
        self.assertTrue(self.root.is_relative_to(Path(tempfile.gettempdir()).resolve()))
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.shims = self.root / "bin"
        self.shims.mkdir()
        fake = self.shims / "fake.cjs"
        fake.write_text(FAKE)
        node = Path(shutil.which("node")).resolve()
        for provider in ("claude", "codex"):
            shim = self.shims / (provider + (".cmd" if os.name == "nt" else ""))
            if os.name == "nt":
                shim.write_text(f'@"{node}" "{fake}" {provider} %*\n')
            else:
                shim.write_text(f'#!/bin/sh\nexec "{node}" "{fake}" {provider} "$@"\n')
                shim.chmod(0o755)
        # Do not inherit paths that could launch a real model CLI.
        git = shutil.which("git")
        paths = [str(self.shims), str(node.parent)]
        if git:
            paths.append(str(Path(git).parent))
        if os.name == "nt":
            paths.append(str(Path(os.environ["SystemRoot"]) / "System32"))
        else:
            paths += ["/usr/bin", "/bin"]
        self.env = dict(os.environ, PATH=os.pathsep.join(paths), FAKE_CAPTURE=str(self.root / "capture.jsonl"))
        self.state = None
        self.file("objective", "Implement the bounded mock task")
        self.file("checks", "Worker artifact reviewed and combined evidence saved")
        self.file("authorization", "Human authorized mock local workers only")
        self.file("scope", "Own worker-output.txt only; no commits or external actions")
        self.file("brief", "Write the expected mock artifact")
        result = self.call("init", "--objective", self.root / "objective", "--checks", self.root / "checks",
                           "--authorization", self.root / "authorization", "--lead", "test-lead", "--directory", self.root / "run", "--limit", "1")
        self.state = Path(result["state_path"])

    def tearDown(self):
        # Every launched runner is awaited before cleanup.
        self.temp.cleanup()

    def file(self, name, text):
        path = self.root / name
        path.write_text(text, encoding="utf-8")
        return path

    def call(self, *args, fail=False):
        command = [sys.executable, str(SKILL / "scripts" / "fleet.py")]
        if self.state:
            command += ["--state", str(self.state)]
        proc = subprocess.run(command + list(map(str, args)), env=self.env, capture_output=True, text=True, timeout=20)
        if fail:
            self.assertNotEqual(proc.returncode, 0, proc.stdout)
            return json.loads(proc.stderr)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout)

    def add(self, task_id="one", provider="codex", *extra):
        return self.call("add", "--id", task_id, "--provider", provider, "--model", "haiku" if provider == "claude" else "gpt-6-luna",
                         "--workspace", self.workspace, "--scope", self.root / "scope", *extra)

    def start(self, task_id="one", request="turn-1", *extra, fail=False):
        return self.call("start", "--id", task_id, "--request-id", request, "--brief", self.root / "brief", *extra, fail=fail)

    def await_turn(self, task_id="one"):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            status = self.call("refresh")
            task = next(t for t in status["tasks"] if t["id"] == task_id)
            if task["state"] not in fleet.ACTIVE:
                return task
            time.sleep(.1)
        self.fail("Mock turn did not complete")

    def evidence(self, task_id="one", passed=True):
        return self.call("review", "--id", task_id, "--pass" if passed else "--rework",
                         "--evidence", self.file("evidence", "Inspected real mock artifact and result; bounded checks pass"))

    def test_codex_launch_duplicate_and_exact_resume(self):
        self.add()
        first = self.start()
        again = self.start()
        self.assertTrue(again["reused"])
        self.assertEqual(first["out_dir"], again["out_dir"])
        self.assertEqual(self.await_turn()["state"], "awaiting_review")
        self.evidence(passed=False)
        self.file("brief", "Fix the same conversation")
        self.start(request="turn-2")
        task = self.await_turn()
        self.assertEqual(task["native_session_id"], "11111111-1111-4111-8111-111111111111")
        captures = [json.loads(x) for x in (self.root / "capture.jsonl").read_text().splitlines()]
        self.assertEqual(len(captures), 2)
        args = captures[1]["args"]
        self.assertIn("resume", args)
        self.assertIn(task["native_session_id"], args)
        self.assertIn("workspace-write", args)
        model_flag = "--model" if "--model" in args else "-m"
        self.assertEqual(args[args.index(model_flag) + 1], "gpt-6-luna")

    def test_claude_launch_and_exact_resume(self):
        self.add(provider="claude")
        self.start()
        self.assertEqual(self.await_turn()["state"], "awaiting_review")
        self.evidence(passed=False)
        self.start(request="turn-2")
        self.assertEqual(self.await_turn()["state"], "awaiting_review")
        args = json.loads((self.root / "capture.jsonl").read_text().splitlines()[-1])["args"]
        self.assertIn("--resume", args)
        self.assertEqual(args[args.index("--model") + 1], "haiku")
        self.assertEqual(args[args.index("--permission-mode") + 1], "acceptEdits")

    def test_dependency_and_capacity(self):
        self.add()
        self.add("two", "codex", "--depends", "one")
        self.start("two", "turn-2", fail=True)
        self.env["FAKE_MODE"] = "hang"
        self.start("one", "turn-1", "--timeout", "1s")
        self.add("three")
        self.start("three", "turn-3", fail=True)
        self.assertEqual(self.await_turn()["state"], "failed")

    def test_changed_idempotent_input_rejected(self):
        self.add()
        self.start()
        self.await_turn()
        self.file("brief", "Different task")
        self.assertIn("different", self.start(fail=True)["error"])

    def test_completion_requires_review_and_monitor_cleanup(self):
        self.add()
        self.start()
        self.await_turn()
        final = self.file("final", "Combined mock artifact check passed")
        self.call("finish", "--evidence", final, fail=True)
        self.evidence()
        monitor = self.file("monitor", json.dumps({"status":"active", "host":"test", "id":"test-monitor"}))
        self.call("monitor", "--record", monitor)
        self.call("finish", "--evidence", final, fail=True)
        monitor.write_text(json.dumps({"status":"stopped", "host":"test", "id":"test-monitor"}))
        self.call("monitor", "--record", monitor)
        self.assertEqual(self.call("finish", "--evidence", final)["state"], "complete")
        self.call("run-status", "--value", "active", "--reason", "reopen", fail=True)

    def test_failed_turn_cannot_be_accepted_or_replaced(self):
        self.add()
        self.env["FAKE_MODE"] = "fail"
        self.start()
        self.assertEqual(self.await_turn()["state"], "failed")
        self.call("review", "--id", "one", "--pass", "--evidence", self.root / "checks", fail=True)
        self.evidence(passed=False)
        self.start(request="replacement", fail=True)
        self.assertEqual(len(fleet.read_json(self.state)["tasks"]["one"]["turns"]), 1)

    def test_bridge_pagination_preserves_review_and_identity(self):
        self.add("one", "claude", "--backend", "bridge", "--read-only")
        event = {"session":{"managed_session_id":"managed-1", "agent":"claude", "state":"completed", "turn_id":"t1"}, "next_cursor":50}
        path = self.file("event", json.dumps(event))
        self.call("record-bridge", "--id", "one", "--event", path)
        self.evidence()
        event["next_cursor"] = 70
        path.write_text(json.dumps(event))
        self.assertEqual(self.call("record-bridge", "--id", "one", "--event", path)["state"], "reviewed")
        event["session"]["managed_session_id"] = "wrong-agent"
        path.write_text(json.dumps(event))
        self.call("record-bridge", "--id", "one", "--event", path, fail=True)

    def test_paused_run_does_not_dispatch(self):
        self.add()
        self.call("run-status", "--value", "paused", "--reason", "Human asked to pause")
        self.start(fail=True)
        self.assertFalse((self.root / "capture.jsonl").exists())

    def test_uncertain_reservation_does_not_relaunch(self):
        self.add()
        state = fleet.read_json(self.state)
        payload = {"kind":"local-turn", "task":"one", "brief":fleet.content(self.root / "brief"), "timeout":"15m", "max_turns":None}
        fleet.reserve(state, "turn-1", payload)
        state["tasks"]["one"]["state"] = "starting"
        fleet.write_json(self.state, state)
        self.assertTrue(self.start()["reused"])
        self.assertFalse((self.root / "capture.jsonl").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
