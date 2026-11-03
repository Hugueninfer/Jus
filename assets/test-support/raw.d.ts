// Vite hands over the text of a template imported with ?raw (the tests read the inline script of the layout from its own file).
declare module '*.twig?raw' {
  const text: string;
  export default text;
}
