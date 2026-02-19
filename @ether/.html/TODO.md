- Upload files
- dropdown of branches
- ..
- Access permissions for which file shown to whom, for .ray is also content of the file
- On editing access permission: prompt with should you change the history access as well?
- Files can inside them have a index.ray.js, to decide how to render them
- Have multiple versions open at the same time.\
- Clones by default go under @ether/<> , how in the interface to say I want @ether @ @ether version is @local
  - Version @local is reserved for this. usernames as version are reserved: The @local is relative to you, the @<ANYONE> is the version by someone else under the same name. or @username/other_path similarly, @username versions are reserved.
- fork should disappear the /~/@me when not @ether, any @/# is reserved and cannot be cloned to. But the original path is fine @ether/library for instance.
- Namespaces of versions. so latest has branches main, ..., and again @me has branches main.. / @me~main ; version of the repository vs branch version

Networking, hosting as a peer is opt-in, but using others is done by default, has to be turned off. For function execution on ether servers is agnostic cloud - choose which one default to the calculated cheapest/what according to preferences; redundancy etc.? ; Need to be able to separately turn on peer hosting vs hosting a function endpoint. Might want to do that per object or top-level, so Online turns on @public, need separate keyword for through proxy, so only through @ether for instance. @proxy.@public @proxy being @ether by default. Another setting needs to be turned on to "act as server"; opt-in for the hosting as peer. Allow chaining of that @, to say traffic should be routed like that. Or the folder is hosted under me, but not part of the Index, so @Public works on where it is hosted; so that you dont have to mark @proxy everywhere. Basically instead: "Start hosting this file/endpoints from your local machine" instead.

- PR comments should use chat infrastructure.


- after encrypt delete history of unencrypted prompt


- allow disabling of the UI overlay for index.ray.js


- Chat goes in @ether/@<USER CHATTING WITH>/
- Chat has text information but also 3d info later.
- Chat has index.ray.js on how to render the chat (shadowed/inherited from main chat repo)
- Group gets created in /@<GROUP> or @ether/#{UUID} (can be given a separate #/@ name by reserving it) then a @me version of that chat.
- All the @me versions should be indexed separately in @me


- shadowed files should be low opacity.


- For the iframes they should come with the caller character, which is/isnt allowed to access the certain player information. It's not @local but a different guest or so.


- More intelligent path mapping when the number of files is very large automatically


- Cron job as function with a execution time 1 / month, first of the month etc.. perhaps just use cron syntax.


- Make the * switch to default View.


- Other VCS in download


- popups should dynamically go the place where there's space, with a preference for a certain direction.


- Allow changing current character to @public or something else to view from that perspective - if cahracter isn't a singular character it doesnt display things like the own repository etc..


- Serve the specific urls with a generated index.html with the title and metadata filled already, since most things dont load with javascript.
- 