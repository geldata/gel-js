import {process} from "https://deno.land/std@0.87.0/node/process.ts";
import {Buffer} from "https://deno.land/std@0.87.0/node/buffer.ts";
import {Sha256, HmacSha256} from "https://deno.land/std@0.87.0/hash/sha256.ts";
import path from "https://deno.land/std@0.87.0/node/path.ts";
import EventEmitter from "https://deno.land/std@0.87.0/node/events.ts";
import util from "https://deno.land/std@0.87.0/node/util.ts";

export {Buffer, path, process, util};

export async function randomBytes(size: number): Promise<Buffer> {
  const buf = new Uint8Array(size);
  const rand = crypto.getRandomValues(buf);

  return Buffer.from(rand);
}

export function H(msg: Buffer): Buffer {
  const sign = new Sha256();
  sign.update(msg);
  return Buffer.from(sign.arrayBuffer());
}

export function HMAC(key: Buffer, ...msgs: Buffer[]): Buffer {
  const hm = new HmacSha256(key);
  for (const msg of msgs) {
    hm.update(msg);
  }
  return Buffer.from(hm.arrayBuffer());
}

export function readFileUtf8Sync(path: string): string {
  return Deno.readTextFileSync(path);
}

export function homeDir(): string {
  throw new Error("not implemented");
}

export function hrTime(): number {
  return performance.now();
}

export namespace net {
  export function createConnection(
    port: number | string,
    hostname?: string
  ): Socket {
    if (typeof port === "string") {
      throw new Error("connection to socket path unsupported");
    }

    const conn = Deno.connect({port, hostname});

    return new Socket(conn);
  }

  export declare interface Socket {
    on(eventName: "error", listener: (e: any) => void): this;
    on(eventName: "connect", listener: () => void): this;
    on(eventName: "data", listener: (data: Buffer) => void): this;
    on(eventName: "close", listener: () => void): this;
  }

  export class Socket extends EventEmitter {
    private _conn: Deno.Conn | null = null;
    private _readIter: AsyncIterableIterator<Uint8Array> | null = null;
    private _paused = true;

    constructor(pconn: Promise<Deno.Conn>) {
      super();
      pconn
        .then((conn) => {
          this._conn = conn;
          this._readIter = Deno.iter(conn);
          this.emit("connect");
          this.resume();
        })
        .catch((e) => this.emit("error", e));
    }

    setNoDelay() {
      // No deno api for this
    }

    pause() {
      this._paused = true;
    }

    async resume() {
      this._paused = false;
      while (!this._paused && this._readIter) {
        try {
          const next = await this._readIter.next();
          this.emit("data", Buffer.from(next.value));

          if (next.done) {
            // I'm assuming when the reader has ended
            // the connection is closed
            this._conn = null;
            this._readIter = null;
            this.emit("close");
          }
        } catch (e) {
          this.emit("error", e);
        }
      }
    }

    async write(data: Buffer) {
      try {
        await this._conn?.write(data);
      } catch (e) {
        this.emit("error", e);
      }
    }

    destroy(error?: Error) {
      this._conn?.close();
      this._conn = null;
      this._readIter = null;
      if (error) {
        throw error;
      }
    }
  }
}
