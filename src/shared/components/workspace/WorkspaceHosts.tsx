/** React owns the layout hosts; the legacy runtime mounts only into their empty slots. */
export function WorkspaceHosts() {
  return <><div id="pl"><div id="agents-panel-host" /><div id="build-tools-host" /></div><div id="pr" /></>;
}
