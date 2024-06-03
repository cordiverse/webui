<template>
  <el-scrollbar>
    <div class="k-content">
      <slot></slot>
    </div>
  </el-scrollbar>
</template>

<style lang="scss">

.k-content {
  --content-padding: 3rem;

  margin: auto;
  max-width: 55rem;
  box-sizing: border-box;
  padding: 3rem var(--content-padding);

  > :first-child {
    margin-top: 0;
  }

  @media screen and (max-width: 768px) {
    --content-padding: 2rem;
  }

  @media screen and (max-width: 480px) {
    --content-padding: 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
    margin: 1.75rem 0;
  }

  h2 {
    font-size: 1.25rem;
    margin: 1rem 0;
  }
}

</style>
