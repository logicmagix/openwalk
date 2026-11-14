// Which build of the app this is, as a person is shown it at the foot of
// Settings: the first thing asked when something goes wrong.

/**
 * The line that names the app and its version. A release is built with its
 * version given; a build made any other way is not a release and says so.
 */
export function versionLine(version: string | undefined): string {
  const given = version?.trim() ?? '';
  return given === '' ? 'OpenWalk, development build' : `OpenWalk ${given}`;
}
