export interface ProviderMeta {
  name: string
  interactive: boolean
  autoRegister: boolean
}

export interface User {
  id: number
  name?: string
  createdAt: string
  updatedAt: string
}

export interface Identity {
  id: number
  userId: number
  provider: string
  createdAt: string
}

export type AuthMode = 'login' | 'register' | 'link'
