<script lang="ts">
  import { Button, type WithChildren } from "bits-ui";

  type Props = WithChildren<Button.RootProps> & {
    variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost" | "link";
    size?: "sm" | "md" | "lg";
  };

  let {
    variant = "primary",
    size = "md",
    children,
    ...restProps
  }: Props = $props();

  const variantClasses = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizeClasses = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
</script>

<Button.Root
  {...restProps}
  class="inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-surface {sizeClasses[size]} {variantClasses[variant]}"
>
  {@render children?.()}
</Button.Root>

