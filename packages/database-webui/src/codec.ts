import { Binary, Dict, isNullable } from 'cosmokit'
import type { Field, Type } from '@cordisjs/database'

export class CodecError extends TypeError {
  constructor(public path: string, message: string) {
    super(path ? `${path}: ${message}` : message)
  }
}

const INTEGER = /^[+-]?\d+$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/**
 * Converts field values between their runtime representation and the JSON
 * representation sent over the webui connection. The conversion follows the
 * declared field type: a registered type is first converted by its `dump`
 * function and then by its underlying type, and decoding applies the reverse
 * steps, so `decode(encode(value))` restores the runtime value.
 *
 * In the JSON representation, bigint values are decimal strings, dates are
 * ISO strings, binary values are base64 strings, and primary keys represented
 * as objects by the driver, such as `ObjectId` of MongoDB, are strings.
 */
export class Codec {
  constructor(private types: Dict<Field.Transform>) {}

  encode(value: any, type?: Type, path = ''): any {
    // a row may omit a field, such as a deprecated one; only null is a value of the field
    if (!type || value === undefined) return value
    // registered types may represent a runtime value by null, so they are resolved first
    const def = this.types[type.type]
    if (def) {
      if (def.dump) value = def.dump(value)
      return this.encode(value, this.underlying(def), path)
    }
    if (isNullable(value)) return value
    if (type.inner || type.array) {
      return this.transform(value, type, path, false, (item, inner, path) => this.encode(item, inner, path))
    }
    switch (type.type) {
      case 'bigint': return String(value)
      case 'date':
      case 'time':
      case 'timestamp': return value instanceof Date ? value.toISOString() : value
      case 'binary': return Binary.toBase64(value)
      case 'primary': return typeof value === 'object' ? String(value) : value
      default: return value
    }
  }

  /**
   * Validates the JSON representation of every built-in type before converting it,
   * so that a registered type never receives a value of the wrong primitive type.
   */
  decode(value: any, type?: Type, path = ''): any {
    if (!type) return value
    const def = this.types[type.type]
    if (def) {
      value = this.decode(value, this.underlying(def), path)
      return def.load ? def.load(value) : value
    }
    if (isNullable(value)) return value
    if (type.inner || type.array) {
      return this.transform(value, type, path, true, (item, inner, path) => this.decode(item, inner, path))
    }
    const fail = (expected: string): never => {
      throw new CodecError(path, `expected ${expected}, got ${JSON.stringify(value)}`)
    }
    switch (type.type) {
      case 'char':
      case 'string':
      case 'text':
      case 'uuid': return typeof value === 'string' ? value : fail('a string')
      case 'integer':
      case 'unsigned':
      case 'float':
      case 'double':
      case 'decimal': return Number.isFinite(value) ? value : fail('a number')
      case 'boolean': return typeof value === 'boolean' ? value : fail('a boolean')
      case 'list': return Array.isArray(value) ? value : fail('an array')
      case 'bigint': {
        // a JSON number beyond the safe range has already lost precision
        if (typeof value === 'string' && INTEGER.test(value.trim())) return BigInt(value.trim())
        if (Number.isSafeInteger(value)) return BigInt(value)
        return fail('an integer string')
      }
      case 'date':
      case 'time':
      case 'timestamp': {
        const date = typeof value === 'string' ? new Date(value) : new Date(NaN)
        return isNaN(date.getTime()) ? fail('a date string') : date
      }
      case 'binary': {
        if (typeof value !== 'string' || !BASE64.test(value)) return fail('a base64 string')
        return Binary.fromBase64(value)
      }
      default: return value
    }
  }

  private underlying(def: Field.Transform): Type {
    return typeof def.type === 'string' ? { type: def.type } as Type : def.type as Type
  }

  /** Rejects a container of the wrong shape when `strict`, and otherwise keeps it unchanged. */
  private transform(value: any, type: Type, path: string, strict: boolean, callback: (value: any, type: Type | undefined, path: string) => any) {
    const join = (key: string | number) => path ? `${path}.${key}` : `${key}`
    const fail = (message: string) => {
      if (strict) throw new CodecError(path, message)
      return value
    }
    if (type.array) {
      if (!Array.isArray(value)) return fail('expected an array')
      return value.map((item, index) => callback(item, type.inner as Type, join(index)))
    }
    if (typeof value !== 'object' || Array.isArray(value)) return fail('expected an object')
    const inner = type.inner as unknown as Dict<Type>
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, callback(item, inner[key], join(key))]))
  }
}
