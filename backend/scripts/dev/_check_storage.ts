import { fileExists } from '../../src/config/storage';

async function main() {
  const paths = [
    "users/cf3e82c3-48fb-4bd5-a43c-6107b8942b59/docs/b22b3447-42be-4cae-89f2-7e4aab5bd54a/TRABALHO_FINAL__1_.PNG",
    "users/cf3e82c3-48fb-4bd5-a43c-6107b8942b59/docs/a62c29ca-3091-4bed-afe9-6e5f87947e48/a62c29ca-3091-4bed-afe9-6e5f87947e48.pptx"
  ];
  for (const p of paths) {
    const exists = await fileExists(p);
    console.log(exists ? "EXISTS" : "MISSING", p.split("/").pop());
  }
  process.exit(0);
}
main();
