<template>
  <footer class="layout-status">
    <div><k-slot name="status-left"></k-slot></div>
    <div><k-slot name="status-right"></k-slot></div>
  </footer>
</template>

<style lang="scss">

.layout-status {
  position: fixed;
  box-sizing: border-box;
  z-index: 50;
  bottom: 0;
  height: var(--footer-height);
  left: var(--nav-width);
  right: 0;
  background-color: var(--bg-secondary);
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid var(--border-primary);
  transition: var(--color-transition);
  font-size: 12px;
  line-height: var(--footer-height);
  color: var(--text-tertiary);
  padding: 0 12px;

  > * {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .el-progress-bar {
    width: 120px;
    margin-right: 2px;
  }
}

</style>
