There is this error : 

## Error Type
Console Error

## Error Message
Encountered two children with the same key, `none`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.


    at CashRegistersClient (app/(app)/cash/client.tsx:255:7)
    at CashPage (app/(app)/cash/page.tsx:143:7)

## Code Frame
  253 |       />
  254 |
> 255 |       <JournalRegisterModal
      |       ^
  256 |         key={booking?.id ?? "none"}
  257 |         locale={locale}
  258 |         register={booking}

Next.js version: 16.1.6 (Turbopack)


Call Stack : 
createConsoleError
node_modules/next/src/next-devtools/shared/console-error.ts (16:35)
handleConsoleError
node_modules/next/src/next-devtools/userspace/app/errors/use-error-handler.ts (31:31)
console.error
node_modules/next/src/next-devtools/userspace/app/errors/intercept-console-error.ts (33:27)
<unknown>
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (6913:23)
runWithFiberInDEV
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (986:30)
warnOnInvalidKey
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (6912:13)
reconcileChildrenArray
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (6981:31)
reconcileChildFibersImpl
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (7305:30)
<unknown>
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (7410:33)
reconcileChildren
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (10036:13)
updateFunctionComponent
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (10517:7)
beginWork
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (12085:35)
runWithFiberInDEV
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (986:30)
performUnitOfWork
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (18997:22)
workLoopConcurrentByScheduler
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (18991:9)
renderRootConcurrent
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (18973:15)
performWorkOnRoot
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (17834:11)
performWorkOnRootViaSchedulerTask
node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (20384:7)
MessagePort.performWorkUntilDeadline
node_modules/next/dist/compiled/scheduler/cjs/scheduler.development.js (45:48)
CashRegistersClient
app/(app)/cash/client.tsx (255:7)
CashPage
app/(app)/cash/page.tsx (143:7)