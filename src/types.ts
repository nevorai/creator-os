export type Reel = {
  id: string
  posted_at: string | null
  transcript: string
  caption: string | null
  pillar: string | null
  hook_type: string | null
  length_seconds: number | null
  format_id: string | null
  is_organic: boolean
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  profile_visits: number | null
  follows: number | null
  source: 'voice_training' | 'graph_api' | 'manual'
  notes: string | null
  created_at: string
}

export type WatchlistAccount = {
  id: string
  handle: string
  wing: 'right' | 'left' | 'neutral' | null
  notes: string | null
  active: boolean
  created_at: string
}

export type Source = {
  id: string
  name: string
  url: string
  type: 'rss' | 'newspaper' | 'other'
  active: boolean
  created_at: string
}

export type BrandBrain = {
  id: 1
  pillars: string[]
  hook_formula: string | null
  voice_notes: string | null
  banned_claims: string | null
  language_register: 'clean' | 'mixed' | 'crude' | null
  updated_at: string
}

export type NewsStory = {
  id: string
  source_id: string | null
  title: string
  url: string
  summary: string | null
  published_at: string | null
  fetched_at: string
}

export type WatchlistPost = {
  id: string
  account_id: string
  post_url: string
  posted_at: string | null
  caption: string | null
  transcript: string | null
  views: number | null
  likes: number | null
  comments: number | null
  is_outlier: boolean
  outlier_ratio: number | null
  fetched_at: string
}

export type AppSettingsRow = {
  id: 1
  instagram_connected: boolean
  anthropic_key_set: boolean
  gemini_key_set: boolean
  updated_at: string
}

export type Employee = {
  id: string
  code: string
  name: string
  desk: 'intelligence' | 'creative' | 'production' | 'performance' | 'manager'
  prompt: string | null
  provider: 'anthropic' | 'gemini'
  model: string | null
  schedule: string | null
  enabled: boolean
  created_at: string
}

export type Format = {
  id: string
  code: string
  name: string
  status: 'promoted' | 'killed' | 'watching'
  description: string
  scriptwriter_rule: string | null
  evidence: string | null
  created_at: string
  updated_at: string
}

export type ReelFormatRow = {
  format_id: string
  reels: Pick<Reel, 'id' | 'posted_at' | 'pillar' | 'is_organic' | 'views'>
}

export type StudioSession = {
  id: string
  topic: string
  research_text: string | null
  hooks_text: string | null
  chosen_hook: string | null
  script_text: string | null
  reel_id: string | null
  production_status: 'scripted' | 'shooting' | 'editing' | 'scheduled' | 'posted'
  created_at: string
  updated_at: string
}

export type ManagerMessage = {
  id: string
  role: 'user' | 'manager'
  content: string
  created_at: string
}

export type ManagerProposal = {
  id: string
  message_id: string | null
  employee_id: string
  field: 'prompt' | 'model' | 'schedule' | 'enabled'
  old_value: string | null
  new_value: string
  rationale: string | null
  status: 'pending' | 'applied' | 'rejected'
  created_at: string
  employees: { code: string; name: string } | null
}

export type Idea = {
  id: string
  topic: string
  pillar: string | null
  why_now: string | null
  confidence: 'high' | 'medium' | 'low' | null
  source: string | null
  status: 'new' | 'used' | 'dismissed'
  created_at: string
}
