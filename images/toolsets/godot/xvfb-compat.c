#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <sys/types.h>
#include <unistd.h>

/* Xserver's Popen resets IDs before starting xkbcomp. OpenShell denies these
 * syscalls, including no-op resets. Skip only resets that cannot change any ID;
 * delegate actual identity changes to libc so sandbox enforcement still applies.
 */
int setgid(gid_t gid) {
    gid_t real, effective, saved;
    if (getresgid(&real, &effective, &saved) == 0 &&
        gid == real && gid == effective && gid == saved)
        return 0;

    int (*next)(gid_t) = dlsym(RTLD_NEXT, "setgid");
    if (next == NULL) {
        errno = ENOSYS;
        return -1;
    }
    return next(gid);
}

int setuid(uid_t uid) {
    uid_t real, effective, saved;
    if (getresuid(&real, &effective, &saved) == 0 &&
        uid == real && uid == effective && uid == saved)
        return 0;

    int (*next)(uid_t) = dlsym(RTLD_NEXT, "setuid");
    if (next == NULL) {
        errno = ENOSYS;
        return -1;
    }
    return next(uid);
}
