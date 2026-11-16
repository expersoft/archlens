import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternalAddress, assertCloneHost } from './plan/netguard.mjs';

const at = (...ips) => async () => ips.map(address => ({ address, family: address.includes(':') ? 6 : 4 }));
const never = async () => { throw new Error('lookup não devia ser chamado'); };

test('isInternalAddress: loopback, privados, link-local, CGNAT e os equivalentes IPv6', () => {
  for (const ip of ['127.0.0.1', '127.255.255.254', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '192.0.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1', '::ffff:10.0.0.5', '::ffff:127.0.0.1', '64:ff9b::a00:5']) {
    assert.equal(isInternalAddress(ip), true, ip);
  }
  for (const ip of ['140.82.112.3', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111', '::ffff:140.82.112.3']) {
    assert.equal(isInternalAddress(ip), false, ip);
  }
  assert.equal(isInternalAddress('não é ip'), true, 'o que não se reconhece como endereço é recusado');
});

test('assertCloneHost: recusa host que resolve para rede interna', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.5']) {
    await assert.rejects(assertCloneHost('x.exemplo', { lookup: at(ip) }),
      { code: 'E_GUI_REPO', message: 'host de rede interna não é permitido; peça ao administrador para incluí-lo em plan.gitHosts' }, ip);
  }
});

test('assertCloneHost: aceita host público; basta um endereço interno entre vários para recusar', async () => {
  await assertCloneHost('github.com', { lookup: at('140.82.112.3') });
  await assertCloneHost('github.com', { lookup: at('140.82.112.3', '2606:50c0:8000::154') });
  await assert.rejects(assertCloneHost('x.exemplo', { lookup: at('140.82.112.3', '10.0.0.5') }), /rede interna/);
  await assert.rejects(assertCloneHost('x.exemplo', { lookup: at() }), { code: 'E_GUI_REPO', message: 'não foi possível resolver o host x.exemplo' });
});

test('assertCloneHost: IP literal passa pela mesma regra, com ou sem colchetes', async () => {
  await assert.rejects(assertCloneHost('169.254.169.254', {}), /rede interna/);
  await assert.rejects(assertCloneHost('[::1]', {}), /rede interna/);
  await assert.rejects(assertCloneHost('localhost', {}), /rede interna/);
});

test('assertCloneHost: falha de resolução vira erro do repositório, sem o detalhe do sistema', async () => {
  const lookup = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND x.exemplo'), { code: 'ENOTFOUND' }); };
  await assert.rejects(assertCloneHost('x.exemplo', { lookup }), { code: 'E_GUI_REPO', message: 'não foi possível resolver o host x.exemplo' });
});

test('assertCloneHost com gitHosts: só os listados, e um listado vale mesmo em rede interna', async () => {
  await assertCloneHost('git.interno', { gitHosts: ['git.interno'], lookup: never });
  await assertCloneHost('10.0.0.5', { gitHosts: ['10.0.0.5'], lookup: never });
  await assertCloneHost('GIT.Interno', { gitHosts: ['git.interno'], lookup: never });
  await assert.rejects(assertCloneHost('github.com', { gitHosts: ['git.interno'], lookup: at('140.82.112.3') }),
    { code: 'E_GUI_REPO', message: 'host não está em plan.gitHosts: github.com' });
});

test('assertCloneHost: host que já recebe o token (gitTokenHosts) continua valendo em rede interna, sem gitHosts', async () => {
  await assertCloneHost('gitlab.empresa.com.br', { trusted: ['gitlab.empresa.com.br'], lookup: at('10.0.0.5') });
  await assert.rejects(assertCloneHost('outro.empresa.com.br', { trusted: ['gitlab.empresa.com.br'], lookup: at('10.0.0.5') }), /rede interna/);
});
