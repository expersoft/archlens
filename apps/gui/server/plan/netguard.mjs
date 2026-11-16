// SSRF guard of the clone: the server must not be a bridge to its own network. A host is refused when any of its
// addresses is internal, unless the administrator listed it in plan.gitHosts.
// Known limit: git resolves the name again when it connects, so a hostile DNS can answer differently the second time.
// The check narrows the risk; plan.gitHosts (only listed hosts are cloned) closes it.
import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

const repoError = message => Object.assign(new Error(message), { code: 'E_GUI_REPO' });

const internal = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) internal.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96]]) internal.addSubnet(net, bits, 'ipv6');

const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (IPv4-mapped included). What is not an address is refused too. */
export function isInternalAddress(ip) {
  const text = String(ip);
  const mapped = MAPPED.exec(text);
  if (mapped) return isInternalAddress(mapped[1]);
  const family = isIP(text);
  if (!family) return true;
  return internal.check(text, family === 6 ? 'ipv6' : 'ipv4');
}

/** True when git reaches https hosts through a proxy (the variables it reads, as the clone's environment keeps them). */
export const httpsProxied = (env = process.env) => ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'].some(k => !!env[k]);

/**
 * Throws E_GUI_REPO unless the server may clone from `host` (a name or an IP literal, brackets allowed).
 * With `gitHosts`, only the listed hosts pass, and a listed one passes whatever it resolves to (a local git server the
 * administrator declared). Without it, every address of the host must be public, except for the `trusted` hosts: the
 * ones that already receive the git token (plan.gitTokenHosts), which the administrator named too. `lookup` is injectable
 * for the tests. `proxied`: git goes through an https proxy (httpsProxied).
 */
export async function assertCloneHost(host, { gitHosts, trusted = [], proxied = false, lookup = dnsLookup } = {}) {
  const name = String(host).toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (gitHosts) {
    if (gitHosts.includes(name)) return;
    throw repoError(`host não está em plan.gitHosts: ${name}`);
  }
  if (trusted.includes(name)) return;
  let addresses;
  if (isIP(name)) addresses = [{ address: name }];
  else {
    try { addresses = await lookup(name, { all: true }); } catch { addresses = []; }
  }
  // Behind a proxy the server may not resolve public names at all: the proxy does, and it is the proxy that connects.
  // A name this machine cannot resolve is then left to it; what does resolve here to the internal network is still refused.
  if (!addresses.length && proxied) return;
  if (!addresses.length) throw repoError(`não foi possível resolver o host ${name}`);
  if (addresses.some(a => isInternalAddress(a.address))) {
    throw repoError('host de rede interna não é permitido; peça ao administrador para incluí-lo em plan.gitHosts');
  }
}
