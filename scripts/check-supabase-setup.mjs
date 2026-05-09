#!/usr/bin/env node
import { createClient } from '../server/node_modules/@supabase/supabase-js/dist/index.mjs'
import dotenv from '../server/node_modules/dotenv/lib/main.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function checkTable(table) {
  const { error, count } = await supabase
    .schema('crossbeam')
    .from(table)
    .select('*', { count: 'exact' })
    .limit(1)

  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`${table}: ${details}`)
  }

  return count ?? 0
}

async function main() {
  const tables = ['projects', 'files', 'messages', 'outputs', 'applicant_answers']

  console.log(`Supabase project: ${supabaseUrl}`)
  for (const table of tables) {
    const count = await checkTable(table)
    console.log(`${table}: OK (${count} rows)`)
  }

  const { data: demos, error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .select('id, flow_type, project_name, city, is_demo, status')
    .eq('is_demo', true)
    .order('created_at', { ascending: false })

  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`projects listing: ${details}`)
  }

  console.log(`demo_projects: ${demos.length}`)
  for (const row of demos) {
    console.log(JSON.stringify(row))
  }

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  if (bucketError) {
    throw new Error(`storage buckets: ${bucketError.message}`)
  }

  const requiredBuckets = ['crossbeam-uploads', 'crossbeam-outputs', 'crossbeam-demo-assets']
  for (const bucket of requiredBuckets) {
    const exists = buckets.some((item) => item.name === bucket)
    if (!exists) {
      throw new Error(`storage bucket missing: ${bucket}`)
    }
    console.log(`bucket ${bucket}: OK`)
  }
}

main().catch((error) => {
  console.error(`SETUP_ERROR: ${error.message}`)
  process.exit(2)
})
