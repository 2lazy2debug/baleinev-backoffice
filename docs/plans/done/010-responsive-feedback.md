# Responsive changes based on user feedback
This document illustrates some changes to be executed after putting in production and receiving some amount of feedback. 
**Important** those changes only apply on the mobile frontend.

## Menu bar changes 
SOA : The menu bar includes an app drawer, the edition switcher, the account page, the language switcher and the logout. 

Changes to be done : 
The menu bar should allow quick access to the following items, in order : 
- tasks
- expenses (translate it as NDF in french for this menu only)
- events
- calendar
- other : app drawer icon (three lines) containing the apps not in the bar, no more submenu
-- other app drawer : it should be closeable by swiping the menu down. in fact, holding the border should do two thing : 
--- expand the drawer till the top 
--- close the drawer once it's too low

## Account icon 
On mobile, this icon used to directly open the account tab. now it should : 
- Be moved on the header area, top right, at the same level of the applet name 
- It should open a submenu with : 
-- Account 
-- Language
-- Edition
-- Logout 

## Events app
- Hide the cost center to the user, it doesn't care
- Hide the "X places left" , it's a redundant information
- Have the time font style be bolder (add 200 weight for now)

## Additional information before writing code 
- Please closely follow design conventions as stated in the CLAUDE.md file
- Commit and push to production with a non-breaking tag once the changes are implemented -- don´t check the deployment status
- Move this plan to docs/plans/done once it's implemented