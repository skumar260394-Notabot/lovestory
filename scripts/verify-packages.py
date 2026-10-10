"""Verify checksums, layout and fresh extracted MCP startup without real clients."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
checks = []
for line in (DIST / 'SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split('  ', 1)
    assert hashlib.sha256((DIST / name).read_bytes()).hexdigest() == digest
    checks.append(name)
with tempfile.TemporaryDirectory(prefix='claude-codex-live-bridge-package-') as temporary:
    sandbox = Path(temporary)
    env = dict(os.environ, HOME=str(sandbox/'home'), USERPROFILE=str(sandbox/'home'),
               CODEX_HOME=str(sandbox/'home/.codex'), CODEX_BRIDGE_ACTIVITY_HOME=str(sandbox/'home/.codex-claude-live'))
    for name in checks:
        destination = sandbox / name.replace('.zip', '').replace('.mcpb', '')
        with zipfile.ZipFile(DIST/name) as archive:
            assert archive.testzip() is None
            assert not any(n.startswith('/') or '..' in n.split('/') for n in archive.namelist())
            archive.extractall(destination)
        skill_prefix = 'delegate-fleet' if '-skills-' in name else 'skills/delegate-fleet'
        skill_source = ROOT/'plugins/claude-codex-live-bridge/skills/delegate-fleet'
        for source in skill_source.rglob('*'):
            if source.is_file() and '__pycache__' not in source.parts and source.suffix != '.pyc':
                assert (destination/skill_prefix/source.relative_to(skill_source)).read_bytes() == source.read_bytes()
        if '-skills-' in name:
            assert (destination/'delegate-fleet/SKILL.md').is_file()
            continue
        if 'alerts' in name:
            assert (destination/'.claude-plugin/plugin.json').is_file()
            continue
        entry = destination / ('server/desktop-server.mjs' if name.endswith('.mcpb') else 'bridge/server.mjs')
        payload = json.dumps({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'release-check','version':'1'}}})+'\n'
        payload += json.dumps({'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}})+'\n'
        run = subprocess.run(['node',str(entry)], input=payload, capture_output=True, text=True, env=env, cwd=destination, timeout=15)
        assert run.returncode == 0, run.stderr
        messages = {m['id']:m for m in map(json.loads,run.stdout.strip().splitlines()) if 'id' in m}
        assert messages[1].get('result'), run.stdout
        assert len(messages[2]['result']['tools']) > 10
        tools = {tool['name'] for tool in messages[2]['result']['tools']}
        provider = 'codex' if name.endswith('.mcpb') else 'claude'
        assert f'create_{provider}_sessions' in tools
        assert {'list_agent_sessions', 'read_agent_session', 'send_agent_message'} <= tools
        if name.endswith('.mcpb'):
            for module in ('common.mjs','protocol.mjs','desktop-activity.mjs','codex-cli.mjs','codex-sessions.mjs','managed-agents.mjs','managed-agent-worker.mjs'):
                assert (destination/'server'/module).read_bytes() == (ROOT/'plugins/claude-codex-live-bridge/bridge'/module).read_bytes()
print(json.dumps({'fresh_package_startup':'passed','checksums':'passed','packages':checks,'live_host_installation':'not verified'}))
