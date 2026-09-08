function cn(...values: Array<string | false>) {
  return values.filter(Boolean).join(" ");
}

export function LintExample() {
  return (
    <section
      className={cn(
        "md:w-[8px] md:h-[8px] md:mt-2 md:mb-2",
        true && "md:hover:bg-red-500 md:hover:text-white",
      )}
    >
      ESLint variant groups
    </section>
  );
}
