<script lang="ts">
  import { ScrollArea, type WithoutChild } from "bits-ui";
 
  type Props = WithoutChild<ScrollArea.RootProps> & {
    orientation: "vertical" | "horizontal" | "both";
    viewportClasses?: string;
  };
 
  let {
    ref = $bindable(null),
    orientation = "vertical",
    viewportClasses,
    children,
    ...restProps
  }: Props = $props();
</script>
 
{#snippet Scrollbar({
  orientation,
}: {
  orientation: "vertical" | "horizontal";
})}
  <ScrollArea.Scrollbar
    {orientation}
    class="group flex touch-none select-none p-0.5 transition-all duration-300 ease-out data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out-0 data-[state=visible]:fade-in-0 {orientation === 'vertical' ? 'w-2 hover:w-2.5' : 'h-2 hover:h-2.5'}"
  >
    <ScrollArea.Thumb class="relative flex-1 rounded-full bg-handle-active/50 transition-colors duration-200 group-hover:bg-handle-active/70" />
  </ScrollArea.Scrollbar>
{/snippet}
 
<ScrollArea.Root bind:ref {...restProps}>
  <ScrollArea.Viewport class={viewportClasses}>
    {@render children?.()}
  </ScrollArea.Viewport>
  {#if orientation === "vertical" || orientation === "both"}
    {@render Scrollbar({ orientation: "vertical" })}
  {/if}
  {#if orientation === "horizontal" || orientation === "both"}
    {@render Scrollbar({ orientation: "horizontal" })}
  {/if}
  <ScrollArea.Corner />
</ScrollArea.Root>