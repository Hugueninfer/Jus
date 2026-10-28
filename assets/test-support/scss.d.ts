// Vite compiles a Sass file imported with ?inline and hands over the resulting CSS text.
declare module '*.scss?inline' {
  const css: string;
  export default css;
}
