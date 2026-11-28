import { describe, expect, it } from 'bun:test'
import type { EventMessage } from 'posthog-node'
import { sanitizeExceptionEvent, sanitizeExceptionProperties } from './error-privacy'

describe('exception privacy', () => {
  it('keeps safe metadata and strips arbitrary properties and exception messages', () => {
    expect(
      sanitizeExceptionProperties({
        source: 'payload',
        collection: 'posts',
        status_code: 500,
        $http_method: 'POST',
        $exception_level: 'error',
        $exception_list: [
          {
            type: 'TypeError',
            value: 'secret@example.test',
            stacktrace: {
              type: 'raw',
              frames: [
                {
                  filename: '/srv/app/users/alice/server.ts',
                  function: 'loadUser',
                  lineno: 12,
                  colno: 3,
                  in_app: true,
                },
              ],
            },
          },
        ],
        $current_url: 'https://example.test/reset?token=secret',
        nextjs_route_path: '/api/users/private-account-name',
        token: 'secret',
      })
    ).toEqual({
      source: 'payload',
      collection: 'posts',
      status_code: 500,
      $http_method: 'POST',
      $exception_level: 'error',
      $exception_list: [
        {
          type: 'TypeError',
          value: 'Exception details redacted',
          stacktrace: {
            type: 'raw',
            frames: [
              {
                filename: 'server.ts',
                function: 'loadUser',
                lineno: 12,
                colno: 3,
                in_app: true,
              },
            ],
          },
        },
      ],
    })
  })

  it('sanitizes only exception events', () => {
    const event = {
      event: '$exception',
      properties: { $exception_list: [{ type: 'Error', value: 'private' }] },
    } as EventMessage
    const sanitized = sanitizeExceptionEvent(event)

    expect(sanitized?.properties).toEqual({
      $exception_list: [{ type: 'Error', value: 'Exception details redacted' }],
    })
    expect(sanitizeExceptionEvent({ ...event, event: 'manual_event' })).toMatchObject({
      event: 'manual_event',
      properties: { $exception_list: [{ type: 'Error', value: 'private' }] },
    })
  })
})
