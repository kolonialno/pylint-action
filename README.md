# Pylint action

Run Pylint and add annotations for any warnings

## Inputs

### `github-token`

**Required** The GitHub API token.

### `paths`

Paths to lint, defaults to the project root.

### `diff-against-brach`

A branch to check any modified files against. The `paths` argument is ignored
if this is specified.

## Example usage

```yaml
name: Pylint
uses: kolonialno/pylint-action
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  diff-against-branch: main
```
