import { createServerClient } from '@supabase/ssr'
import { createServerOnlyFn } from '@tanstack/react-start'
import { getCookies, setCookie } from '@tanstack/react-start/server'

const getEnvValue = (key: string) => {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> })
    .env
  return process.env[key] ?? metaEnv?.[key]
}

export const getSupabaseServerClient = createServerOnlyFn(() => {
  const supabaseUrl =
    getEnvValue('VITE_SUPABASE_URL') ?? getEnvValue('SUPABASE_URL')
  const supabaseAnonKey =
    getEnvValue('VITE_SUPABASE_ANON_KEY') ?? getEnvValue('SUPABASE_ANON_KEY')

  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL')
  if (!supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY')

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return Object.entries(getCookies()).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookies: Array<{ name: string; value: string }>) {
          cookies.forEach((cookie) => {
            setCookie(cookie.name, cookie.value)
          })
        },
      },
    }
  )
})

export const auth = {
  signIn: async (email: string, password: string) => {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  signUp: async (email: string, password: string) => {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  getSession: async () => {
    const supabase = getSupabaseServerClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    return session
  },

  getUser: async () => {
    const supabase = getSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  }
}
