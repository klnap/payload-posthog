import { describe, expect, it } from 'bun:test'
import {
  BUILT_IN_SENSITIVE_PARAMETERS,
  mergeSensitiveParameters,
  parameterVariants,
  SENSITIVE_PARAMETER_NAMES,
} from './sensitive-parameters'

describe('sensitive parameter names', () => {
  it('derives the common naming conventions for a compound name', () => {
    expect(parameterVariants('access_token')).toEqual([
      'access_token',
      'accessToken',
      'AccessToken',
      'access-token',
      'ACCESS_TOKEN',
      'ACCESS-TOKEN',
    ])
  })

  it('covers every canonical name in snake_case, camelCase, and kebab-case', () => {
    for (const name of SENSITIVE_PARAMETER_NAMES) {
      expect(BUILT_IN_SENSITIVE_PARAMETERS).toContain(name)
      expect(BUILT_IN_SENSITIVE_PARAMETERS).toContain(parameterVariants(name)[1] as string)
      expect(BUILT_IN_SENSITIVE_PARAMETERS).toContain(parameterVariants(name)[3] as string)
    }
  })

  it('does not contain duplicates', () => {
    expect(new Set(BUILT_IN_SENSITIVE_PARAMETERS).size).toBe(BUILT_IN_SENSITIVE_PARAMETERS.length)
  })

  it('does not cover the mixed-case spelling that is outside the derived conventions', () => {
    expect(BUILT_IN_SENSITIVE_PARAMETERS).not.toContain('Access_TOKEN')
  })

  it('merges host names first, deduplicates, and never mutates the input', () => {
    const host = ['custom_secret', 'password']
    const merged = mergeSensitiveParameters(host)
    expect(merged.slice(0, 2)).toEqual(['custom_secret', 'password'])
    expect(new Set(merged).size).toBe(merged.length)
    expect(host).toEqual(['custom_secret', 'password'])
  })

  it('returns the built-in list when the host configures nothing', () => {
    expect(mergeSensitiveParameters(undefined)).toEqual([...BUILT_IN_SENSITIVE_PARAMETERS])
  })
})
