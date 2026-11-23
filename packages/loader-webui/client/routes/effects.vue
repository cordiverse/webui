<template>
  <k-content v-if="currentEntry">
    <effect-tree :effects="currentEntry.effects ?? []"/>
  </k-content>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext } from '@cordisjs/client'
import effectTree from '../components/effect-tree.vue'

const ctx = useContext()

const currentEntry = computed(() => ctx.manager.currentEntry!)

</script>
