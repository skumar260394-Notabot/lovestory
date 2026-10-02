"""Build a companion for an explicitly verified host route; does not install it."""
import argparse
import json
from pathlib import Path
from build import sources, package

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1] / 'claude/alerts')
p.add_argument('--server', required=True)
p.add_argument('--tool', default='reply_hook')
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
if not a.server.strip() or any(c in a.server + a.tool for c in '\r\n'):
    p.error('Provide an exact single-line configured server/tool name.')
if a.tool != 'reply_hook' and not a.tool.endswith('__reply_hook'):
    p.error('This builder supports the direct tool or a namespaced alias with identical inputs, not wrapper tools.')
files = sources(a.source)
manifest = json.loads(files['.claude-plugin/plugin.json'])
config = json.loads(files['hooks/hooks.json'])
for groups in config['hooks'].values():
    for group in groups:
        for hook in group['hooks']:
            assert hook['type'] == 'mcp_tool' and hook['tool'] == 'reply_hook'
            hook['server'], hook['tool'] = a.server, a.tool
files['hooks/hooks.json'] = (json.dumps(config, indent=2) + '\n').encode()
files['ROUTE.md'] = (f"Configured route: `{a.server}` / `{a.tool}`.\n"
    "The namespace must come from the intended host, not a display-name guess.\n"
    "Install as a replacement of this same companion identity, then run a native probe.\n"
    "Package construction does not establish hook support or message delivery.\n").encode()
a.output.parent.mkdir(parents=True, exist_ok=True)
package(a.output, files)
print(json.dumps({'package': str(a.output), 'identity': manifest['name'], 'server': a.server,
    'tool': a.tool, 'installed': False, 'transport_verified': False}))
