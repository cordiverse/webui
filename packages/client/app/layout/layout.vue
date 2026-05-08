<template>
  <div class="k-layout page-content" :class="container">
    <layout-header>
      <template #left>
        <slot name="header">{{ route.meta.activity?.name }}</slot>
      </template>
      <template #right>
        <slot name="menu">
          <template v-if="typeof menu === 'string'">
            <template v-for="item in ctx.client.action.menus[menu]" :key="menu">
              <layout-menu-item
                v-if="item.id !== '@separator'"
                :item="{ ...item, ...ctx.client.action.actions[item.id.startsWith('.') ? menu + item.id : item.id] }"
                :menu-key="menu" :menu-data="menuData"
              />
            </template>
          </template>
          <template v-else>
            <layout-menu-item v-for="item in menu" :item="item" />
          </template>
        </slot>
      </template>
    </layout-header>
    <main class="main-content" :class="main">
      <slot></slot>
    </main>
  </div>
</template>

<script lang="ts" setup>

import { useRoute } from '@cordisjs/client'
import { LegacyMenuItem, useContext } from '@cordisjs/client'
import LayoutHeader from './header.vue'
import LayoutMenuItem from './menu-item.vue'

defineProps<{
  main?: string
  container?: string
  menu?: string | LegacyMenuItem[]
  menuData?: any
}>()

const route = useRoute()
const ctx = useContext()

</script>

<style lang="scss">

.k-layout.page-content {
  position: fixed;
  box-sizing: border-box;
  z-index: 100;
  top: 0;
  left: var(--nav-width);
  bottom: var(--footer-height);
  right: 0;
  background-color: var(--bg-primary);
  transition: var(--color-transition);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>
