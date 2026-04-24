import type { InjectionKey, Ref, ComputedRef } from 'vue'
import type { Dict } from 'cosmokit'
import type { SearchObject } from '@cordisjs/registry'
import type { Dependency } from '../src'

export const kActivePackage: InjectionKey<Ref<string>> = Symbol('market.active')
export const kPackagesMap: InjectionKey<ComputedRef<Dict<SearchObject>>> = Symbol('market.packages')
export const kDependencies: InjectionKey<ComputedRef<Dict<Dependency>>> = Symbol('market.deps')
export const kRefresh: InjectionKey<() => void> = Symbol('market.refresh')
export const kShowConfirm: InjectionKey<Ref<boolean>> = Symbol('market.show-confirm')
export const kShowManual: InjectionKey<Ref<boolean>> = Symbol('market.show-manual')
