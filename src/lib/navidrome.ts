import { md5 } from "./md5";

const VERSION = '1.6.1'

export interface Credentials {
    username: string
    password: string
}

interface SubsonicResponse {
    status: string
    version: string
    type: string
    serverVersion: string
    error?: SubsonicError
}

interface SubsonicError {
    code: number
    message: string
}

function generateRandomSalt(length: number) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export class Client {
    private apiPath: string;
    private credentials: Credentials;
    private encoder: TextEncoder

    public constructor(apiPath: string, credentials: Credentials) {
        this.apiPath = apiPath;        
        this.credentials = credentials;
        this.encoder = new TextEncoder()
    }
    

    async ping() {
        const salt = generateRandomSalt(16);
        const token = md5(this.encoder.encode(`${this.credentials.password}${salt}`)).toHex()
        const params = new URLSearchParams({
            u: this.credentials.username,
            t: token,
            s: salt,
            c: 'hificoos',
            f: 'json',
            v: VERSION,
        })
        const url = `${this.apiPath}/rest/ping?${params}`
        const rawResp = await fetch(url)
        const content = await rawResp.json()
        const resp = content['subsonic-response'] as SubsonicResponse
        if (resp.error && resp.error.code != 0) {
            throw new Error(`[${resp.error?.code}] ${resp.error?.message}`)
        }
        if (resp.status !== "ok") {
            throw new Error(`Bad status: ${resp.status}`)
        }
    }
}