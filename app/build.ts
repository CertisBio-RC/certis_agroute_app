// app/build.ts
// Export a timestamp string whenever the project is built.
// GitHub Actions will regenerate this each deploy.
export const BUILD_STAMP: string = "build: " + new Date().toISOString();
