<template>
  <logs class="settings-logger" :filter="filter" max-height="216px">
    <template #header>
      <h2 class="k-schema-header">
        运行日志
      </h2>
    </template>
  </logs>
</template>

<script setup lang="ts">

import { useContext } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-manager/client'
import { Message } from 'reggol'
import Logs from './logs.vue'

const ctx = useContext()

function filter(message: Message) {
  return message.entryId === ctx.manager?.currentEntry?.id
}

</script>

<style lang="scss">

.settings-logger {
  border-radius: 8px;

  .logs {
    padding: 0.5rem 0.5rem;
  }

  @media screen and (max-width: 768px) {
    border-radius: 0;
    margin: 0 calc(0px - var(--content-padding));
  }
}

</style>
