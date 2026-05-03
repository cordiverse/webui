<template>
  <k-layout main="darker">
    <template #header>
      <span class="crumb">{{ title }}</span>
    </template>
    <login v-if="!store.user" />
    <user v-else />
  </k-layout>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { store } from './store'
import Login from './login.vue'
import User from './user.vue'

const title = computed(() => store.user ? '账号' : '登录')
</script>
