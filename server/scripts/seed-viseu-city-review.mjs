import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PDF_PATHS = {
  planBinder: 'C:\\Users\\Duarte\\Desktop\\Hele\\ARQUITETURA FINAL (1).dwf.pdf',
  pipApproval: 'C:\\Users\\Duarte\\Desktop\\Hele\\Aprovação PIP CMV.pdf',
  workDescription: 'C:\\Users\\Duarte\\Desktop\\Hele\\Descrição detalhada de obra.pdf',
};

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before seeding a project.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing input PDF: ${filePath}`);
  }
}

function pdfSpec(localPath, fileType) {
  assertFileExists(localPath);
  return {
    localPath,
    fileType,
    filename: path.basename(localPath),
    sizeBytes: fs.statSync(localPath).size,
  };
}

function toStorageSafeFilename(filename) {
  return filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function resolveProjectOwnerId() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) {
    throw new Error(`Failed to list auth users: ${error.message}`);
  }

  const existingUser = data?.users?.[0];
  if (existingUser?.id) {
    return existingUser.id;
  }

  const email = `crossbeam-viseu-demo-${Date.now()}@example.local`;
  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
    user_metadata: {
      seeded_by: 'seed-viseu-city-review',
      role: 'demo-owner',
    },
  });

  if (created.error || !created.data?.user?.id) {
    throw new Error(`Failed to create fallback auth user: ${created.error?.message || 'unknown error'}`);
  }

  return created.data.user.id;
}

async function createProject(ownerUserId) {
  const projectId = randomUUID();
  const projectName = 'Teste real Viseu - Harmonia Partilhada';
  const projectAddress = 'Viso Norte, Viseu';

  const { error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .insert({
      id: projectId,
      user_id: ownerUserId,
      flow_type: 'city-review',
      project_name: projectName,
      project_address: projectAddress,
      city: 'Viseu',
      status: 'ready',
      applicant_name: 'Harmonia Partilhada, Unipessoal, Lda.',
      is_demo: true,
    });

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  return {
    projectId,
    projectName,
    projectAddress,
  };
}

async function uploadProjectFile(ownerUserId, projectId, spec) {
  const objectFilename = toStorageSafeFilename(spec.filename);
  const objectPath = `${ownerUserId}/${projectId}/seed-viseu-city-review/${objectFilename}`;
  const fileBuffer = fs.readFileSync(spec.localPath);

  const upload = await supabase.storage
    .from('crossbeam-uploads')
    .upload(objectPath, fileBuffer, {
      upsert: true,
      contentType: 'application/pdf',
    });

  if (upload.error) {
    throw new Error(`Failed to upload ${spec.filename}: ${upload.error.message}`);
  }

  const { error } = await supabase
    .schema('crossbeam')
    .from('files')
    .insert({
      project_id: projectId,
      file_type: spec.fileType,
      filename: spec.filename,
      storage_path: `crossbeam-uploads/${objectPath}`,
      mime_type: 'application/pdf',
      size_bytes: spec.sizeBytes,
    });

  if (error) {
    throw new Error(`Failed to register ${spec.filename}: ${error.message}`);
  }

  return {
    filename: spec.filename,
    fileType: spec.fileType,
    storagePath: `crossbeam-uploads/${objectPath}`,
    sizeBytes: spec.sizeBytes,
  };
}

async function main() {
  const specs = [
    pdfSpec(PDF_PATHS.planBinder, 'plan-binder'),
    pdfSpec(PDF_PATHS.pipApproval, 'other'),
    pdfSpec(PDF_PATHS.workDescription, 'other'),
  ];

  const ownerUserId = await resolveProjectOwnerId();
  const project = await createProject(ownerUserId);
  const uploadedFiles = [];

  for (const spec of specs) {
    uploadedFiles.push(await uploadProjectFile(ownerUserId, project.projectId, spec));
  }

  console.log(JSON.stringify({
    ok: true,
    project_id: project.projectId,
    owner_user_id: ownerUserId,
    project_name: project.projectName,
    project_address: project.projectAddress,
    city: 'Viseu',
    files: uploadedFiles,
    next_steps: {
      open_project_path: `/projects/${project.projectId}`,
      generate_payload: {
        project_id: project.projectId,
        flow_type: 'city-review',
      },
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
