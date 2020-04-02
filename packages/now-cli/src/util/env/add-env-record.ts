import { Output } from '../output';
import Client from '../client';
import { Secret, ProjectEnvTarget } from '../../types';
import { customAlphabet } from 'nanoid';
import slugify from '@sindresorhus/slugify';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  envName: string,
  envValue: string,
  target: ProjectEnvTarget
): Promise<void> {
  output.debug(`Adding environment variable ${envName}`);

  const urlSecret = `/v2/now/secrets/${encodeURIComponent(envName)}`;
  const secret = await client.fetch<Secret>(urlSecret, {
    method: 'POST',
    body: JSON.stringify({
      name: generateSecretName(envName, target),
      value: envValue,
      projectId: projectId,
      decryptable: target === ProjectEnvTarget.Development,
    }),
  });

  const urlProject = `/v4/projects/${projectId}/env`;
  await client.fetch<Secret>(urlProject, {
    method: 'POST',
    body: JSON.stringify({
      key: envName,
      value: secret.uid,
      target,
    }),
  });
}

const randomSecretSuffix = customAlphabet(
  '123456789abcdefghijklmnopqrstuvwxyz',
  4
);

function generateSecretName(envName: string, target: ProjectEnvTarget) {
  return `${slugify(envName)}-${target}-${randomSecretSuffix()}`;
}
