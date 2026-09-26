package com.phoneflow.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;
import java.util.List;

public class ServerDiscoveryTest {
    @Test
    public void scansEachLocal24WithoutProbingThePhoneItselfOrDuplicates() {
        List<String> hosts = ServerDiscovery.candidateHosts(List.of("192.168.1.42", "192.168.1.42"));
        assertEquals(253, hosts.size());
        assertEquals("192.168.1.1", hosts.get(0));
        assertFalse(hosts.contains("192.168.1.42"));
        assertTrue(hosts.contains("192.168.1.254"));
    }
}
