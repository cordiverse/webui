<template>
  <component :is="Cmp" />
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { store } from '../store'
import LoginIcon from './login.vue'
import UserIcon from './user.vue'

const Cmp = computed(() => store.user ? UserIcon : LoginIcon)
</script>
