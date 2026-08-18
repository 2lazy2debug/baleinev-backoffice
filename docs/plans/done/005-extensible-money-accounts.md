# Extensible money accounts

Today the bank account and cash account are set in stone with no way to change that. 

The members of the administrator and accounting role (comptabilite) should be able to create and edit an account, and to delete it if there's no records. 

structure of an account : 

pk : auto (see prisma conf )
description : string 
type : enum [bank | cash | other]

Add the menu entry under "Editions"