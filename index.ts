import { spawn } from 'child_process'
import { PassThrough } from 'stream'

interface ExecOpts {
    cmd: string
    argv?: string[]
    user?: string,
    res_type?: string,
    timeout?: number,
    cwd?: string
}

const default_exec_opts: Partial<ExecOpts> = {
    argv: [],
    user: 'nobody',
    res_type: 'octet/stream',
    timeout: 5 * 1000,
    cwd: '/',
}

function contains_content_type(str: string, contentType: string): boolean {
    return str.toLowerCase().split(/\s*;\s*/).includes(contentType.toLowerCase())
}

const DENY_ENV: (string | RegExp)[] = [
    /EXEC_.*/,
]
function transfer_env(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return Object.fromEntries(Object.entries(env).filter(([k]) => {
        return !DENY_ENV.some((v) => {
            if (v instanceof RegExp) return v.test(k)
            return v === k
        })
    }))
}

const server = Bun.serve({
    port: process.env['EXEC_PORT'] || 3000,
    async fetch(req) {
        const u = new URL(req.url, 'http://localhost')
        if (u.pathname === '/exec') {
            if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
            let key = u.searchParams.get('key')
            if (key !== process.env['EXEC_KEY']) return new Response('Unauthorized', { status: 401 })
            if (!contains_content_type(req.headers.get('Content-Type') || '', 'application/json')) return new Response('Invalid Content-Type', { status: 415 })
            const cmd_opts: ExecOpts | null = await req.json().catch(() => null)
            if (!cmd_opts) return new Response('Bad Request', { status: 400 })
            // exec args
            const o = Object.assign({}, default_exec_opts, cmd_opts) as Required<ExecOpts>
            let cmd: string = o.cmd, argv: string[] = Array.from(o.argv)
            if (typeof o.user === 'string') {
                argv.unshift('-u', o.user, '--', o.cmd)
                cmd = '/usr/bin/sudo'
            }
            if (o.timeout < 0) o.timeout = 0
            // exec
            console.info(`Execute: ${cmd} ${argv.join(' ')}`)
            let p = spawn(cmd, argv, {
                stdio: 'pipe',
                env: transfer_env(process.env),
                cwd: o.cwd,
            })
            // generate response buffer
            const stream = new PassThrough()
            p.stdout.pipe(stream)
            p.stderr.pipe(stream)
            // stream.on('data', (chunk) => { buf.write(chunk) })
            await new Promise((resolve) => {
                let sid = setTimeout(() => {
                    stream.pause()
                    stream.write('\nError: Timeout. Task was killed.\n')
                    stream.end()
                    p.kill('SIGKILL')
                }, o.timeout)

                p.on('close', () => {
                    clearTimeout(sid)
                    stream.end()
                })
                // waiting for exit code
                p.on('exit', (code) => {
                    resolve('exit')
                })
            })
            const headers = new Headers()
            headers.set('Content-Type', o.res_type)
            headers.set('X-Exit-Code', String(p.exitCode))
            return new Response(<any>stream, { status: 200, headers })
        }
        return new Response('Not Found', { status: 404 })
    },
})

console.info(`Server started at ${server.url}`)