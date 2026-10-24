import { supabase } from './supabase'

/** Calls one of our edge functions; throws a plain-English Error with the server's message. */
export async function callFn<T = Record<string, unknown>>(name: string, body: Record<string, unknown>, timeoutMs = 100_000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const { data, error, response } = await supabase.functions.invoke(name, { body, signal: ctl.signal } as never)
    if (error) {
      let msg = 'Something went wrong. Try again.'
      try {
        const j = await (response ?? (error as { context?: Response }).context)?.clone().json()
        if (j?.error) msg = String(j.error)
      } catch { /* keep the generic message */ }
      throw new Error(msg)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}
