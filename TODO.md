- currently when pasted with a note opened, it doens't add the "edited" mark on it. the whole thing with "clear" button on the top, "New Note" in the search modal is sus. we should make it more clear.

- import exported notes (for new device). do we need .json for that in there right now or just files is fine for now?
- search by more than just name, it should store metadata like creation date, last modified.
  maybe add description to file. then search by name, then by desc, then by content (if possible)
- rewrite in vite+ts
- swap showdown for something else
  opencode -s ses_e8549fffbffe5Mm7QBVyarIXO1


# old stuff

- it scrolls well, but sometimes can't reach to the bottom
- copy button for code snippets
- ```tsx and jsx don't have syntax highlighting
- doesn't render:   $$\text{ratio} = \frac{\text{scrollTop}}{\text{scrollHeight} - \text{clientHeight}}$$
- make readme say it's on `https://matredit.github.io/markdown-viewer/`
- I want to write my changes and not be afraid they'll be gone if power goes out or PC crashes. Is it done already? or do I have to rely on google drive? or browser only is fine here as well? remember, even in perfect world we'll cache all our .md files in browser, and use gdrive only to sync


- add ability to save files fast in the cloud. I was going to host it on github pages, so maybe we need to use google drive for that.
  We should be able to save indivitual markdown files and list and search them nicely by name, timestamp, contents.
  And save AI conversation mode to append message after message with clear separator and also save them.

- open .md files from disk like normal app. i hope we don't need tauri or electron here
