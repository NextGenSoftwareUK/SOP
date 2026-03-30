#!/usr/bin/env node
import { program } from 'commander'
import { connect }  from '../src/commands/connect'
import { addConnector } from '../src/commands/add'
import { startWatch } from '../src/commands/watch'
import { linkAvatar } from '../src/commands/link'
import { showStatus } from '../src/commands/status'

program
  .name('star')
  .description('OASIS STAR Watch — background SOP intelligence for your existing tools')
  .version('0.1.0')

program
  .command('connect')
  .description('Authenticate with OASIS and configure your org')
  .action(connect)

program
  .command('add <connector>')
  .description('Connect an integration: slack | salesforce | github | email | jira')
  .action(addConnector)

program
  .command('watch')
  .description('Start the STAR Watch daemon')
  .option('-d, --daemon', 'Run as a background process')
  .option('--install', 'Register as a system service (launchd/systemd)')
  .option('--verbose', 'Show all events, including low-confidence matches')
  .option('--dev', 'Run in dev mode — no credentials required, uses synthetic events')
  .action(startWatch)

program
  .command('link <source> <sourceId>')
  .description('Link a tool user to an OASIS Avatar (e.g. star link slack U12345 --avatar kelly@acme.com)')
  .option('--avatar <email>', 'Avatar email address')
  .option('--me', 'Link yourself (sends a verification DM)')
  .action(linkAvatar)

program
  .command('status')
  .description('Show connected integrations and active SOP runs')
  .action(showStatus)

program.parse()
