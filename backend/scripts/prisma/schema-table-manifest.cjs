const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const modelBlockRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
const modelMapRegex = /@@map\("([^"]+)"\)/;

function parseSchemaMappedTables(schemaSource) {
  const tables = new Set();
  let modelMatch = null;
  while ((modelMatch = modelBlockRegex.exec(schemaSource)) !== null) {
    const modelName = modelMatch[1];
    const modelBody = modelMatch[2] || "";
    const mapMatch = modelMapRegex.exec(modelBody);
    tables.add(mapMatch?.[1] || modelName);
  }
  modelBlockRegex.lastIndex = 0;
  return [...tables].sort();
}

function resolveSchemaPath(cwd = process.cwd()) {
  return join(cwd, "prisma", "schema.prisma");
}

function loadSchemaMappedTables(schemaPath = resolveSchemaPath()) {
  const schema = readFileSync(schemaPath, "utf8");
  return parseSchemaMappedTables(schema);
}

module.exports = {
  parseSchemaMappedTables,
  resolveSchemaPath,
  loadSchemaMappedTables,
};
