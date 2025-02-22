import type { ScalarCodec } from "./ifaces";
import type { Codecs } from "./codecs";

export type CodecValueType<S> =
  S extends Codecs.KnownCodecs[keyof Codecs.KnownCodecs]
    ? S extends Codecs.Codec<infer T>
      ? T
      : never
    : never;

const NOOP: Codecs.AnyCodec = {
  toDatabase(data: any) {
    return data;
  },
  fromDatabase(data: any) {
    return data;
  },
};

export type MutableCodecMap = Map<string, Codecs.AnyCodec>;
export type ReadonlyCodecMap = ReadonlyMap<string, Codecs.AnyCodec>;

type ContainerNames = keyof Codecs.ContainerCodecs;
type ContainerOverload<T extends ContainerNames> =
  | Codecs.ContainerCodecs[T]
  | undefined;

export class CodecContext {
  private readonly spec: ReadonlyCodecMap | null;
  private readonly map: Map<string, Codecs.AnyCodec>;

  constructor(spec: ReadonlyCodecMap | null) {
    if (spec === null || spec.size === 0) {
      this.spec = null;
    } else {
      this.spec = spec;
    }
    this.map = new Map();
  }

  private initCodec(codec: ScalarCodec): Codecs.AnyCodec {
    const specMap = this.spec!;
    const targetTypeName = codec.typeName;

    const s = specMap.get(targetTypeName);
    if (s != null) {
      this.map.set(targetTypeName, s);
      return s;
    }

    const ancestors = codec.ancestors;
    if (ancestors == null) {
      // Base type, like std::int32
      this.map.set(targetTypeName, NOOP);
      return NOOP;
    }

    for (let i = 0; i < ancestors.length; i++) {
      const parent = ancestors[i];
      const s = specMap.get(parent.typeName);
      if (s != null) {
        this.map.set(targetTypeName, s);
        return s;
      }
    }

    this.map.set(targetTypeName, NOOP);
    return NOOP;
  }

  getContainerOverload<T extends ContainerNames>(
    kind: T,
  ): ContainerOverload<T> {
    if (this.spec === null || !this.spec.size) {
      return;
    }
    // Look inside 'this.spec' directly (not in 'this.map')
    // as we don't need to find the "closest" codec --
    // containers like 'sql row' don't support inheritance
    // and have no "resolution order".
    return this.spec.get(kind) as ContainerOverload<T>;
  }

  hasOverload(codec: ScalarCodec): boolean {
    if (this.spec === null || !this.spec.size) {
      return false;
    }

    const op = this.map.get(codec.typeName);
    if (op === NOOP) {
      return false;
    }
    if (op != null) {
      return true;
    }
    return this.initCodec(codec) !== NOOP;
  }

  postDecode<T>(codec: ScalarCodec, value: CodecValueType<T>): any {
    if (this.spec === null || !this.spec.size) {
      return value;
    }

    let op = this.map.get(codec.typeName);
    if (op === NOOP) {
      return value;
    }

    if (op == null) {
      op = this.initCodec(codec);
    }
    return op.fromDatabase(value);
  }

  preEncode<T>(codec: ScalarCodec, value: any): CodecValueType<T> {
    if (this.spec === null || !this.spec.size) {
      return value;
    }

    let op = this.map.get(codec.typeName);
    if (op === NOOP) {
      return value;
    }

    if (op == null) {
      op = this.initCodec(codec);
    }
    return op.toDatabase(value);
  }
}

export const NOOP_CODEC_CONTEXT = new CodecContext(null);
