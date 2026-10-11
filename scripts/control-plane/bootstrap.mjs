import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const root = process.cwd()
const data = path.join(root, '.data')
mkdirSync(data, { recursive: true })
const envPath = path.join(root, '.env.local')
if (!existsSync(envPath)) {
  const username = 'operator'
  const password = randomBytes(18).toString('hex')
  const environment = [
    'MC_AGENTDOCK_P0=1', 'MC_DISABLE_RUNTIME_SCAN=1', 'NEXT_PUBLIC_GATEWAY_OPTIONAL=true',
    'MC_ALLOWED_HOSTS=localhost,127.0.0.1,::1', 'MC_COOKIE_SECURE=false', 'MC_DISABLE_HSTS=1',
    `AUTH_USER=${username}`, `AUTH_PASS=${password}`, `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    `API_KEY=${randomBytes(32).toString('hex')}`, 'MC_COORDINATOR_AGENT=',
  ].join('\n') + '\n'
  writeFileSync(envPath, environment, { mode: 0o600, flag: 'wx' })
  writeFileSync(path.join(data, 'operator-login.json'), JSON.stringify({ username, password }, null, 2), { mode: 0o600, flag: 'wx' })
  writeFileSync(path.join(data, '登录信息.txt'), `Mission Control 本地 P0\n用户名：${username}\n密码：${password}\n入口：http://127.0.0.1:4310/agentdock\n仅本机使用。首次登录后可在账户设置中修改密码。\n`, { mode: 0o600, flag: 'wx' })
}
console.log('P0 local configuration ready. Login details are in .data/登录信息.txt (not printed).')
