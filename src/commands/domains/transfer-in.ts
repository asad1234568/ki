import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import getDomainStatus from '../../util/domains/get-domain-status';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import textInput from '../../util/input/text';
import transferInDomain from '../../util/domains/transfer-in-domain';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';

const isValidAuthCode = (code: string) => !!(code && code.length > 0);

type Options = {
  '--debug': boolean;
  '--code': string;
};

export default async function transferIn(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const [domainName] = args;
  if (!domainName) {
    output.error(`Missing domain name. Run ${cmd('now domains --help')}`);
    return 1;
  }

  const { domain: rootDomain, subdomain } = psl.parse(domainName);
  if (subdomain || !rootDomain) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const authCode = isValidAuthCode(opts['--code'])
    ? opts['--code']
    : await textInput({
        label: `Transfer auth code: `,
        validateValue: isValidAuthCode
      });

  const transferStamp = stamp();
  const stopTransferSpinner = wait('Transferring');
  const transferInResult = await transferInDomain(client, domainName, authCode);

  stopTransferSpinner();

  if (transferInResult instanceof ERRORS.InvalidDomain) {
    output.error(`The domain ${transferInResult.meta.domain} is not valid.`);
    return 1;
  }

  if (
    transferInResult instanceof ERRORS.DomainNotAvailable ||
    transferInResult instanceof ERRORS.DomainNotTransferable
  ) {
    output.error(
      `The domain "${transferInResult.meta.domain}" is not transferable.`
    );
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${param(
      domainName
    )} transfer started ${transferStamp()}`
  );

  output.print(
    `We have initiated a transfer for ${domainName}.\nTo finalize the transfer, we are waiting for approval from your current registrar.`
  );
  return 0;
}
