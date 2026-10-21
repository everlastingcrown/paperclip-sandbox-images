# Login shells run this after OpenShell mounts its per-sandbox proxy CA.
# Keep the image's JDK truststore read-only and retain its public roots.
_paperclip_java_openshell_ca() (
  [ -r /etc/openshell-tls/openshell-ca.pem ] || return 0
  case ${JAVA_TOOL_OPTIONS:-} in
    *-Djavax.net.ssl.trustStore=*) return 0 ;;
  esac

  _java_home=${JAVA_HOME:-/opt/java17}
  # A private directory prevents collisions between users and concurrent shells.
  # Create a fresh copy so a restarted sandbox cannot reuse an obsolete CA.
  umask 077
  _java_dir=$(mktemp -d /tmp/openshell-java.XXXXXXXXXX) || return 1
  if ! cp "$_java_home/lib/security/cacerts" "$_java_dir/cacerts"; then
    rm -rf "$_java_dir"
    return 1
  fi
  # cacerts can be read-only in the source image.
  if ! chmod u+w "$_java_dir/cacerts" ||
    ! "$_java_home/bin/keytool" -importcert -noprompt -trustcacerts \
      -alias openshell-sandbox \
      -file /etc/openshell-tls/openshell-ca.pem \
      -keystore "$_java_dir/cacerts" -storepass changeit >/dev/null; then
    rm -rf "$_java_dir"
    return 1
  fi
  printf '%s\n' "$_java_dir/cacerts"
)

if _paperclip_java_truststore=$(_paperclip_java_openshell_ca); then
  if [ -n "$_paperclip_java_truststore" ]; then
    JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }-Djavax.net.ssl.trustStore=$_paperclip_java_truststore -Djavax.net.ssl.trustStorePassword=changeit"
    export JAVA_TOOL_OPTIONS
  fi
else
  echo 'Unable to configure Java trust for the OpenShell proxy CA' >&2
fi
unset _paperclip_java_truststore
unset -f _paperclip_java_openshell_ca
