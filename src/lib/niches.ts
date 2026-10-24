import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useTenant } from './tenant'

export type MyNiche = { id: string; name: string; primary: boolean }

/** The niches this creator picked, with display names (catalogue name or their own custom one). */
export function useNiches() {
  const { tenant } = useTenant()
  return useQuery({
    queryKey: ['my_niches', tenant?.id],
    enabled: Boolean(tenant),
    staleTime: 30_000,
    queryFn: async (): Promise<MyNiche[]> => {
      const [mine, cat] = await Promise.all([
        supabase.from('tenant_niches').select('id, niche_key, custom_name, is_primary').order('created_at'),
        supabase.rpc('niche_catalogue'),
      ])
      if (mine.error) throw mine.error
      const names = new Map(((cat.data ?? []) as { key: string; name: string }[]).map((n) => [n.key, n.name]))
      return (mine.data ?? []).map((n) => ({
        id: n.id as string,
        name: (n.niche_key ? names.get(n.niche_key as string) : null) ?? (n.custom_name as string | null) ?? 'Niche',
        primary: n.is_primary as boolean,
      }))
    },
  })
}
