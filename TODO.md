- hyprland and my mouse. SOMETIMES it highlights whatever invisible cursor is on. I can't reproduce it consistently.
- UI consistency: 
  - image Click-to-Zoom has "Diagram View" label. we shouldn't make that conditional, we should just make it generic or remove completely.
  - in Pewview it says "Paste text from your agent on the left..." but we have somethin on the left only in Split view. again, just make it generic.

- spec? tests? or just give agents way to compare with original
- rewrite in vite+ts
- swap showdown for something else
  opencode -s ses_e8549fffbffe5Mm7QBVyarIXO1


# old stuff

- split view sync scrolls well, but sometimes can't reach to the bottom
- make readme say it's on `https://matredit.github.io/markdown-viewer/`
- I want to write my changes and not be afraid they'll be gone if power goes out or PC crashes. Is it done already? or do I have to rely on google drive? or browser only is fine here as well? remember, even in perfect world we'll cache all our .md files in browser, and use gdrive only to sync


- add ability to save files fast in the cloud. I was going to host it on github pages, so maybe we need to use google drive for that.
  We should be able to save indivitual markdown files and list and search them nicely by name, timestamp, contents.
  And save AI conversation mode to append message after message with clear separator and also save them.

- open .md files from disk like normal app. i hope we don't need tauri or electron here
