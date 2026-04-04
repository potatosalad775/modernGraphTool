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
    primary: "bg-primary text-primary-content hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-content hover:bg-secondary/80",
    destructive: "bg-error text-error-content hover:bg-error/90",
    outline: "border border-base-content/20 bg-transparent hover:bg-accent hover:text-accent-content",
    ghost: "hover:bg-accent hover:text-accent-content",
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
  class="inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-base-100 {sizeClasses[size]} {variantClasses[variant]}"
>
  {@render children?.()}
</Button.Root>

