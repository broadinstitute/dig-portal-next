import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { effectorCatalogSchema, sanitizePlainText } from '@dig-portal/content';
import { parse } from 'csv-parse/sync';

const sourceId = 'egl_241';
const requiredColumns = ['Trait ID', 'Effector list name', 'Title', 'Citation', 'PMID', 'Page ID'];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(row, column) {
  if (typeof row[column] !== 'string') throw new Error(`Missing CSV field "${column}".`);
  return row[column].trim();
}

function optionalText(value) {
  return value === '' || value.toLowerCase() === 'undefined' ? null : value;
}

function convertCsv(csv) {
  let headers;
  const rows = parse(csv, {
    bom: true,
    columns: (columns) => {
      headers = columns;
      return columns;
    },
    skip_empty_lines: true,
  });
  if (!headers || requiredColumns.some((name) => headers.filter((header) => header === name).length !== 1)) {
    throw new Error('Effector-list CSV does not contain the expected unique columns.');
  }

  const entries = [];
  let skipped = 0;
  for (const row of rows) {
    const rawTraits = optionalText(text(row, 'Trait ID'));
    if (rawTraits === null) {
      skipped += 1;
      continue;
    }
    const traitIds = rawTraits.split(';').map((trait) => sanitizePlainText(trait).trim()).filter(Boolean);
    if (traitIds.length === 0) throw new Error('Effector-list CSV contains an empty trait list.');
    entries.push({
      traitIds,
      name: sanitizePlainText(text(row, 'Effector list name')).trim(),
      title: sanitizePlainText(text(row, 'Title')).trim(),
      citation: sanitizePlainText(text(row, 'Citation')).trim(),
      pmid: optionalText(text(row, 'PMID')),
      pageId: optionalText(text(row, 'Page ID')),
    });
  }
  if (entries.length === 0) throw new Error('Effector-list CSV contains no phenotype-linked entries.');
  return { catalog: effectorCatalogSchema.parse({ sourceId, entries }), skipped };
}

export async function importEffectorCatalog(portalPath, fetchRequest = globalThis.fetch) {
  const url = new URL('https://hugeampkpncms.org/jsonapi/node/research_page');
  url.searchParams.set('filter[field_page_id]', sourceId);
  url.searchParams.set('fields[node--research_page]', 'status,field_page_mode,field_page_id,field_data_type,field_data_points');
  const response = await fetchRequest(url, {
    headers: { Accept: 'application/vnd.api+json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`CMS request failed with HTTP ${response.status}.`);

  let body;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error('CMS returned invalid JSON.', { cause });
  }
  if (!isRecord(body) || !Array.isArray(body.data) || body.data.length !== 1
    || (body.links !== undefined && !isRecord(body.links)) || body.links?.next) {
    throw new Error('CMS did not return exactly one effector-list page.');
  }
  const attributes = body.data[0]?.attributes;
  if (!isRecord(attributes) || attributes.field_page_id !== sourceId
    || attributes.status !== true || attributes.field_page_mode !== 'public') {
    throw new Error('The effector-list page is missing, unpublished, or not public.');
  }
  if (attributes.field_data_type !== 'direct_csv' || typeof attributes.field_data_points !== 'string') {
    throw new Error('The published effector-list page does not contain the expected CSV.');
  }

  const { catalog, skipped } = convertCsv(attributes.field_data_points);
  const directory = path.join(portalPath, 'content', 'effector-lists');
  const destination = path.join(directory, 'catalog.json');
  const temporary = path.join(directory, `.catalog-${randomUUID()}.tmp`);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { destination, imported: catalog.entries.length, skipped };
}
