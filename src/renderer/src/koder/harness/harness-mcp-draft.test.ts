import { describe, expect, it } from 'vitest'
import {
  blankDraft,
  looksLikeSecret,
  mongoDbDraft,
  toMcpInput,
  validateMcpDraft,
  type HarnessMcpDraft
} from './harness-mcp-draft'

const draft = (over: Partial<HarnessMcpDraft> = {}): HarnessMcpDraft => ({
  ...mongoDbDraft('1'),
  envVar: 'MONGODB_URI',
  ...over
})

describe('looksLikeSecret', () => {
  it('rejects a connection string pasted where a name belongs', () => {
    expect(looksLikeSecret('mongodb+srv://user:pass@cluster.mongodb.net/db')).toBe(true)
  })

  it.each(['MONGODB_URI', 'DATABASE_URL', '_private', 'A1'])('accepts the name %s', (name) => {
    expect(looksLikeSecret(name)).toBe(false)
  })

  it('rejects anything with a separator, a space or a scheme', () => {
    expect(looksLikeSecret('my var')).toBe(true)
    expect(looksLikeSecret('/etc/passwd')).toBe(true)
    expect(looksLikeSecret('https://example.test')).toBe(true)
  })

  it('rejects a string too long to be a variable name', () => {
    expect(looksLikeSecret('A'.repeat(65))).toBe(true)
  })

  it('says nothing about an empty field', () => {
    expect(looksLikeSecret('')).toBe(false)
  })
})

describe('validateMcpDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateMcpDraft(draft())).toEqual([])
  })

  it('refuses a secret in the variable field outright', () => {
    expect(validateMcpDraft(draft({ envVar: 'mongodb+srv://a:b@c/d' }))).toEqual([
      'envVarLooksLikeSecret'
    ])
  })

  it('reports an invalid variable name separately from a secret', () => {
    expect(validateMcpDraft(draft({ envVar: '9lives' }))).toEqual(['envVarInvalid'])
  })

  it('accepts a server that needs no environment at all', () => {
    expect(validateMcpDraft(draft({ envKey: '', envVar: '' }))).toEqual([])
  })

  it('refuses half a binding', () => {
    expect(validateMcpDraft(draft({ envVar: '' }))).toEqual(['envVarRequired'])
    expect(validateMcpDraft(draft({ envKey: '' }))).toEqual(['envKeyRequired'])
  })

  it('requires a name and a command', () => {
    expect(validateMcpDraft(blankDraft('1'))).toEqual(['nameRequired'])
    expect(validateMcpDraft(draft({ command: '  ' }))).toEqual(['commandRequired'])
  })

  it('refuses a server name that is not a config key', () => {
    expect(validateMcpDraft(draft({ name: 'my server' }))).toEqual(['nameInvalid'])
  })
})

describe('toMcpInput', () => {
  it('splits the args the way a command line reads', () => {
    expect(toMcpInput(draft({ args: '  -y   mongodb-mcp-server ' })).args).toEqual([
      '-y',
      'mongodb-mcp-server'
    ])
  })

  it('drops the binding when either half is blank', () => {
    expect(toMcpInput(draft({ envVar: '' })).env).toEqual([])
  })
})
